require('dotenv').config();

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'emergency',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initializeDatabase() {
  if (!process.env.DB_USER) {
    throw new Error('Set DB_USER in the local .env file before starting ERFlow.');
  }

  const connection = await pool.getConnection();
  connection.release();

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS patients (
      record_order BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      id VARCHAR(64) NOT NULL,
      name VARCHAR(150) NOT NULL,
      age SMALLINT UNSIGNED NOT NULL,
      gender VARCHAR(30) NOT NULL,
      symptoms TEXT NOT NULL,
      severity TINYINT UNSIGNED NOT NULL,
      arrival_time VARCHAR(10) NOT NULL,
      required_unit VARCHAR(50) NOT NULL,
      treatment_status VARCHAR(40) NOT NULL,
      bed_status VARCHAR(40) NOT NULL,
      triage_category VARCHAR(20) NOT NULL,
      assigned_bed VARCHAR(100) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY patients_record_order (record_order)
    ) ENGINE=InnoDB
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS beds (
      unit VARCHAR(50) NOT NULL,
      available_beds INT NOT NULL,
      PRIMARY KEY (unit)
    ) ENGINE=InnoDB
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS waiting_queue (
      queue_position INT UNSIGNED NOT NULL,
      patient_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (queue_position),
      UNIQUE KEY waiting_queue_patient (patient_id)
    ) ENGINE=InnoDB
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS action_history (
      action_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      action_type VARCHAR(30) NOT NULL,
      patient_id VARCHAR(64) NOT NULL,
      before_state JSON NULL,
      after_state JSON NULL,
      message VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (action_id)
    ) ENGINE=InnoDB
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) NOT NULL,
      setting_value VARCHAR(255) NOT NULL,
      PRIMARY KEY (setting_key)
    ) ENGINE=InnoDB
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS staff_accounts (
      username VARCHAR(30) NOT NULL,
      name VARCHAR(100) NOT NULL,
      password_salt CHAR(32) NOT NULL,
      password_hash CHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (username)
    ) ENGINE=InnoDB
  `);

  for (const [unit, count] of Object.entries({
    ICU: 2,
    Ward: 3,
    Observation: 2,
    Emergency: 2,
  })) {
    await pool.execute(
      'INSERT IGNORE INTO beds (unit, available_beds) VALUES (?, ?)',
      [unit, count]
    );
  }
}

function decodeJson(value) {
  if (value === null || value === undefined || typeof value === 'object') {
    return value;
  }
  return JSON.parse(value);
}

async function loadState() {
  const [patientRows] = await pool.execute(`
    SELECT id, name, age, gender, symptoms, severity, arrival_time, required_unit,
           treatment_status, bed_status, triage_category, assigned_bed
    FROM patients
    ORDER BY record_order
  `);
  const [bedRows] = await pool.execute('SELECT unit, available_beds FROM beds');
  const [queueRows] = await pool.execute(
    'SELECT patient_id FROM waiting_queue ORDER BY queue_position'
  );
  const [historyRows] = await pool.execute(`
    SELECT action_type, patient_id, before_state, after_state, message
    FROM action_history
    ORDER BY action_id
  `);

  const patients = patientRows.map((row) => ({
    id: row.id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    symptoms: row.symptoms,
    severity: row.severity,
    arrivalTime: row.arrival_time,
    requiredUnit: row.required_unit,
    treatmentStatus: row.treatment_status,
    bedStatus: row.bed_status,
    triageCategory: row.triage_category,
    assignedBed: row.assigned_bed,
  }));
  const beds = Object.fromEntries(
    bedRows.map((row) => [row.unit, row.available_beds])
  );
  const history = historyRows.map((row) => ({
    actionType: row.action_type,
    patientId: row.patient_id,
    beforeState: decodeJson(row.before_state),
    afterState: decodeJson(row.after_state),
    message: row.message,
  }));

  return {
    patients,
    beds,
    queueIds: queueRows.map((row) => row.patient_id),
    history,
  };
}

async function saveState(state) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM patients');
    await connection.execute('DELETE FROM beds');
    await connection.execute('DELETE FROM waiting_queue');
    await connection.execute('DELETE FROM action_history');

    for (const patient of state.patients) {
      await connection.execute(
        `INSERT INTO patients (
          id, name, age, gender, symptoms, severity, arrival_time, required_unit,
          treatment_status, bed_status, triage_category, assigned_bed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patient.id,
          patient.name,
          patient.age,
          patient.gender,
          patient.symptoms,
          patient.severity,
          patient.arrivalTime,
          patient.requiredUnit,
          patient.treatmentStatus,
          patient.bedStatus,
          patient.triageCategory,
          patient.assignedBed,
        ]
      );
    }

    for (const [unit, count] of Object.entries(state.beds)) {
      await connection.execute(
        'INSERT INTO beds (unit, available_beds) VALUES (?, ?)',
        [unit, count]
      );
    }

    for (const [position, patientId] of (state.queueIds || []).entries()) {
      await connection.execute(
        'INSERT INTO waiting_queue (queue_position, patient_id) VALUES (?, ?)',
        [position, patientId]
      );
    }

    for (const action of state.history) {
      await connection.execute(
        `INSERT INTO action_history (
          action_type, patient_id, before_state, after_state, message
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          action.actionType,
          action.patientId,
          action.beforeState ? JSON.stringify(action.beforeState) : null,
          action.afterState ? JSON.stringify(action.afterState) : null,
          action.message,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Unable to roll back the MySQL transaction:', rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function getSetting(key) {
  const [rows] = await pool.execute(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?',
    [key]
  );
  return rows[0]?.setting_value ?? null;
}

async function countPatients() {
  const [rows] = await pool.execute('SELECT COUNT(*) AS patient_count FROM patients');
  return Number(rows[0].patient_count);
}

async function createStaffAccount(account) {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO staff_accounts (username, name, password_salt, password_hash)
     VALUES (?, ?, ?, ?)`,
    [account.username, account.name, account.passwordSalt, account.passwordHash]
  );
  return result.affectedRows === 1;
}

async function getStaffAccount(username) {
  const [rows] = await pool.execute(
    `SELECT username, name, password_salt, password_hash
     FROM staff_accounts WHERE username = ?`,
    [username]
  );
  if (!rows.length) return null;
  return {
    username: rows[0].username,
    name: rows[0].name,
    passwordSalt: rows[0].password_salt,
    passwordHash: rows[0].password_hash,
  };
}

async function setSetting(key, value) {
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  closeDatabase,
  countPatients,
  createStaffAccount,
  getStaffAccount,
  getSetting,
  initializeDatabase,
  loadState,
  saveState,
  setSetting,
};
