const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const {
  closeDatabase,
  countPatients,
  createStaffAccount,
  getStaffAccount,
  getSetting,
  initializeDatabase,
  loadState,
  saveState,
  setSetting,
} = require('./database');

const derivePassword = promisify(crypto.pbkdf2);
const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = 'erflow_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();

  const sessionToken = (req.headers.cookie || '')
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const session = sessionToken && sessions.get(sessionToken);

  if (!session || session.expiresAt <= Date.now()) {
    if (sessionToken) sessions.delete(sessionToken);
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }

  req.staffAccount = session.account;
  return next();
});

class LinkedListNode {
  constructor(data) {
    this.data = data;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.size = 0;
  }

  insert(data) {
    const node = new LinkedListNode(data);
    if (!this.head) {
      this.head = node;
      this.size += 1;
      return data;
    }

    let current = this.head;
    while (current.next) {
      current = current.next;
    }
    current.next = node;
    this.size += 1;
    return data;
  }

  findById(id) {
    let current = this.head;
    while (current) {
      if (current.data.id === id) {
        return current.data;
      }
      current = current.next;
    }
    return null;
  }

  removeById(id) {
    if (!this.head) return null;

    if (this.head.data.id === id) {
      const removed = this.head.data;
      this.head = this.head.next;
      this.size -= 1;
      return removed;
    }

    let prev = this.head;
    let current = this.head.next;

    while (current) {
      if (current.data.id === id) {
        prev.next = current.next;
        this.size -= 1;
        return current.data;
      }
      prev = current;
      current = current.next;
    }

    return null;
  }

  toArray() {
    const result = [];
    let current = this.head;
    while (current) {
      result.push(current.data);
      current = current.next;
    }
    return result;
  }

  updateById(id, updates) {
    const patient = this.findById(id);
    if (!patient) return null;
    Object.assign(patient, updates);
    return patient;
  }
}

class Queue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  enqueue(value) {
    const node = { value, next: null };
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }
    this.size += 1;
    return value;
  }

  dequeue() {
    if (!this.head) {
      return null;
    }

    const value = this.head.value;
    this.head = this.head.next;
    if (!this.head) {
      this.tail = null;
    }
    this.size -= 1;
    return value;
  }

  removeById(id) {
    if (!this.head) return null;

    if (this.head.value.id === id) {
      return this.dequeue();
    }

    let previous = this.head;
    let current = this.head.next;

    while (current) {
      if (current.value.id === id) {
        previous.next = current.next;
        if (!previous.next) {
          this.tail = previous;
        }
        this.size -= 1;
        return current.value;
      }
      previous = current;
      current = current.next;
    }

    return null;
  }

  toArray() {
    const result = [];
    let current = this.head;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }

  isEmpty() {
    return this.size === 0;
  }
}

class Stack {
  constructor() {
    this.top = null;
    this.size = 0;
  }

  push(value) {
    this.top = { value, next: this.top };
    this.size += 1;
    return value;
  }

  pop() {
    if (!this.top) return null;
    const value = this.top.value;
    this.top = this.top.next;
    this.size -= 1;
    return value;
  }

  peek() {
    return this.top ? this.top.value : null;
  }

  isEmpty() {
    return this.size === 0;
  }

  toArray() {
    const result = [];
    let current = this.top;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }
}

class BSTNode {
  constructor(id, patient) {
    this.id = id;
    this.patient = patient;
    this.left = null;
    this.right = null;
  }
}

class PatientBST {
  constructor() {
    this.root = null;
  }

  insert(id, patient) {
    const node = new BSTNode(id, patient);
    if (!this.root) {
      this.root = node;
      return;
    }

    let current = this.root;
    while (current) {
      if (id < current.id) {
        if (!current.left) {
          current.left = node;
          return;
        }
        current = current.left;
      } else if (id > current.id) {
        if (!current.right) {
          current.right = node;
          return;
        }
        current = current.right;
      } else {
        current.patient = patient;
        return;
      }
    }
  }

  find(id) {
    let current = this.root;
    while (current) {
      if (id === current.id) {
        return current.patient;
      }
      current = id < current.id ? current.left : current.right;
    }
    return null;
  }

  inorder() {
    const result = [];
    const walk = (node) => {
      if (!node) return;
      walk(node.left);
      result.push(node.patient);
      walk(node.right);
    };
    walk(this.root);
    return result;
  }

  preorder() {
    const result = [];
    const walk = (node) => {
      if (!node) return;
      result.push(node.patient);
      walk(node.left);
      walk(node.right);
    };
    walk(this.root);
    return result;
  }

  postorder() {
    const result = [];
    const walk = (node) => {
      if (!node) return;
      walk(node.left);
      walk(node.right);
      result.push(node.patient);
    };
    walk(this.root);
    return result;
  }
}

class HospitalGraph {
  constructor() {
    this.adjacency = {
      Reception: {},
      Triage: {},
      Emergency: {},
      ICU: {},
      Lab: {},
      Ward: {},
      Discharge: {},
      Observation: {},
    };
  }

  addEdge(from, to) {
    this.adjacency[from][to] = 1;
    this.adjacency[to][from] = 1;
  }

  shortestPath(start, end) {
    if (!this.adjacency[start] || !this.adjacency[end]) {
      return [];
    }

    const queue = [start];
    const visited = { [start]: true };
    const pathMap = { [start]: null };
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;
      if (current === end) break;

      for (const neighbor of Object.keys(this.adjacency[current])) {
        if (!visited[neighbor]) {
          visited[neighbor] = true;
          pathMap[neighbor] = current;
          queue.push(neighbor);
        }
      }
    }

    if (!visited[end]) {
      return [];
    }

    const route = [];
    let current = end;
    while (current) {
      route.unshift(current);
      current = pathMap[current];
    }
    return route;
  }
}

const hospitalGraph = new HospitalGraph();
[
  ['Reception', 'Triage'],
  ['Triage', 'Emergency'],
  ['Triage', 'Lab'],
  ['Emergency', 'ICU'],
  ['Emergency', 'Ward'],
  ['Emergency', 'Observation'],
  ['Lab', 'Ward'],
  ['ICU', 'Discharge'],
  ['Ward', 'Discharge'],
].forEach(([from, to]) => hospitalGraph.addEdge(from, to));

let patientStore = new LinkedList();
let waitingQueue = new Queue();
let actionHistory = new Stack();
let patientTree = new PatientBST();
let sortedPatientIndex = [];
const beds = {
  ICU: 2,
  Ward: 3,
  Observation: 2,
  Emergency: 2,
};

let mutationQueue = Promise.resolve();
const validTreatmentStatuses = new Set([
  'Queued',
  'Under Treatment',
  'Transferred',
  'Discharged',
]);

function formatClock(date = new Date()) {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function timeToMinutes(value) {
  if (!value || !value.includes(':')) return 0;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function calculateSeverityCategory(severity) {
  if (severity >= 8) return 'Critical';
  if (severity >= 5) return 'High';
  if (severity >= 3) return 'Medium';
  return 'Low';
}

function clonePatient(patient) {
  return JSON.parse(JSON.stringify(patient));
}

function saveAction(actionType, patientId, beforeState, afterState, message) {
  actionHistory.push({
    actionType,
    patientId,
    beforeState,
    afterState,
    message,
    timestamp: new Date().toISOString(),
  });
}

function prioritySort(patients) {
  const compare = (a, b) => {
    if (b.severity !== a.severity) {
      return b.severity - a.severity;
    }
    return timeToMinutes(a.arrivalTime) - timeToMinutes(b.arrivalTime);
  };
  const merge = (left, right) => {
    const result = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
      if (compare(left[leftIndex], right[rightIndex]) <= 0) {
        result.push(left[leftIndex]);
        leftIndex += 1;
      } else {
        result.push(right[rightIndex]);
        rightIndex += 1;
      }
    }

    return result.concat(left.slice(leftIndex), right.slice(rightIndex));
  };
  const sort = (items) => {
    if (items.length < 2) return items;
    const middle = Math.floor(items.length / 2);
    return merge(sort(items.slice(0, middle)), sort(items.slice(middle)));
  };
  return sort([...patients]);
}

function getCurrentPatients() {
  return patientStore.toArray();
}

function comparePatientIds(left, right) {
  const leftId = left.toLowerCase();
  const rightId = right.toLowerCase();
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}

function binarySearchPatient(id) {
  let low = 0;
  let high = sortedPatientIndex.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const comparison = comparePatientIds(sortedPatientIndex[middle].id, id);
    if (comparison === 0) return sortedPatientIndex[middle];
    if (comparison < 0) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

function getPriorityList() {
  return prioritySort(
    getCurrentPatients().filter(
      (patient) => !['Discharged', 'Transferred'].includes(patient.treatmentStatus)
    )
  );
}

function getQueueList() {
  return waitingQueue.toArray();
}

function getNextRecommendedPatient() {
  const candidates = prioritySort(getQueueList());

  if (!candidates.length) {
    return { patient: null, message: 'No patients waiting for treatment.' };
  }

  const selected = candidates.find((candidate) => {
    const unit = candidate.requiredUnit || 'Observation';
    return (beds[unit] ?? 0) > 0;
  });

  if (!selected) {
    return {
      patient: candidates[0],
      message: 'No suitable bed is available for any waiting patient. Patients remain queued.',
      feasible: false,
    };
  }

  const unit = selected.requiredUnit || 'Observation';
  return {
    patient: selected,
    message: `Recommended next: ${selected.name} (${selected.id}) for ${unit}.`,
    feasible: true,
  };
}

function removeFromQueueById(id) {
  waitingQueue.removeById(id);
}

function syncWaitingQueue() {
  const waiting = new Map(
    getCurrentPatients()
      .filter((patient) => patient.treatmentStatus === 'Queued')
      .map((patient) => [patient.id, patient])
  );
  const ordered = [];
  const added = new Set();

  for (const patient of waitingQueue.toArray()) {
    if (waiting.has(patient.id)) {
      ordered.push(waiting.get(patient.id));
      added.add(patient.id);
    }
  }
  for (const patient of waiting.values()) {
    if (!added.has(patient.id)) ordered.push(patient);
  }

  waitingQueue = new Queue();
  ordered.forEach((patient) => waitingQueue.enqueue(patient));
}

function captureDomainSnapshot() {
  return {
    version: 1,
    patients: getCurrentPatients().map(clonePatient),
    beds: { ...beds },
    queueIds: getQueueList().map((patient) => patient.id),
  };
}

function findAvailableBed(unit) {
  const occupiedBeds = new Set(
    getCurrentPatients()
      .filter((patient) => patient.treatmentStatus === 'Under Treatment')
      .map((patient) => patient.assignedBed)
  );

  for (let number = 1; number <= Object.values(beds).reduce((sum, count) => sum + count, 0) + getCurrentPatients().length + 1; number += 1) {
    const bed = `${unit}-Bed-${number}`;
    if (!occupiedBeds.has(bed)) return bed;
  }
  return null;
}

function releaseBed(patient) {
  if (patient.treatmentStatus === 'Under Treatment' && patient.bedStatus === 'Assigned') {
    if (beds[patient.requiredUnit] !== undefined) {
      beds[patient.requiredUnit] += 1;
    }
  }
  patient.assignedBed = 'None';
}

function registerPatient(patientData) {
  if (!patientData || typeof patientData !== 'object' || Array.isArray(patientData)) {
    return { error: 'Patient details must be provided.' };
  }
  const patientId = String(patientData.id || '').trim();
  const name = String(patientData.name || '').trim();
  const age = Number(patientData.age);
  const severity = Number(patientData.severity);

  if (!patientId || !name) {
    return { error: 'Patient ID and name are required.' };
  }
  if (patientId.length > 64 || name.length > 150) {
    return { error: 'Patient ID must be at most 64 characters and name at most 150.' };
  }

  if (patientStore.findById(patientId)) {
    return { error: `Patient ID ${patientId} already exists.` };
  }

  if (!Number.isInteger(age) || age < 1 || age > 120) {
    return { error: 'Age must be a whole number between 1 and 120.' };
  }

  if (!Number.isInteger(severity) || severity < 1 || severity > 10) {
    return { error: 'Severity must be between 1 and 10.' };
  }

  const requiredUnit = patientData.requiredUnit || 'Observation';
  if (!Object.hasOwn(beds, requiredUnit)) {
    return { error: 'Select a unit with bed capacity.' };
  }
  const gender = patientData.gender || 'Unknown';
  if (!['Unknown', 'F', 'M', 'Other'].includes(gender)) {
    return { error: 'Select a valid gender.' };
  }
  const symptoms = String(patientData.symptoms || 'Not specified').trim();
  const arrivalTime = String(patientData.arrivalTime || formatClock()).trim();
  if (symptoms.length > 1000) {
    return { error: 'Symptoms must be at most 1,000 characters.' };
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)) {
    return { error: 'Arrival time must use the 24-hour HH:mm format.' };
  }
  const beforeState = captureDomainSnapshot();
  const patient = {
    id: patientId,
    name,
    age,
    gender,
    symptoms,
    severity,
    arrivalTime,
    requiredUnit,
    treatmentStatus: 'Queued',
    bedStatus: 'Waiting',
    triageCategory: calculateSeverityCategory(severity),
    assignedBed: 'None',
  };

  patientStore.insert(patient);
  patientTree.insert(patient.id, patient);
  waitingQueue.enqueue(patient);
  saveAction(
    'register',
    patient.id,
    beforeState,
    captureDomainSnapshot(),
    `Registered patient ${patient.name}.`
  );

  return { patient, message: 'Patient registered successfully.' };
}

function updatePatient(id, updates) {
  const patient = patientStore.findById(id);
  if (!patient) {
    return { error: 'Patient not found.' };
  }

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { error: 'Patient updates must be provided as an object.' };
  }

  const allowedFields = new Set([
    'age',
    'gender',
    'symptoms',
    'severity',
    'arrivalTime',
    'requiredUnit',
    'treatmentStatus',
  ]);
  const unknownFields = Object.keys(updates).filter((field) => !allowedFields.has(field));
  if (unknownFields.length) {
    return { error: `Unsupported patient fields: ${unknownFields.join(', ')}.` };
  }

  const beforeState = captureDomainSnapshot();
  const sanitized = { ...updates };

  if (sanitized.severity !== undefined) {
    sanitized.severity = Number(sanitized.severity);
    if (!Number.isInteger(sanitized.severity) || sanitized.severity < 1 || sanitized.severity > 10) {
      return { error: 'Severity must be between 1 and 10.' };
    }
  }

  if (sanitized.age !== undefined) {
    sanitized.age = Number(sanitized.age);
    if (!Number.isInteger(sanitized.age) || sanitized.age < 1 || sanitized.age > 120) {
      return { error: 'Age must be a whole number between 1 and 120.' };
    }
  }

  for (const field of ['gender', 'symptoms', 'arrivalTime']) {
    if (sanitized[field] !== undefined) {
      if (typeof sanitized[field] !== 'string') {
        return { error: `${field} must be text.` };
      }
      sanitized[field] = sanitized[field].trim();
    }
  }
  if (
    sanitized.gender !== undefined &&
    !['Unknown', 'F', 'M', 'Other'].includes(sanitized.gender)
  ) {
    return { error: 'Select a valid gender.' };
  }
  if (sanitized.symptoms !== undefined && sanitized.symptoms.length > 1000) {
    return { error: 'Symptoms must be at most 1,000 characters.' };
  }
  if (
    sanitized.arrivalTime !== undefined &&
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(sanitized.arrivalTime)
  ) {
    return { error: 'Arrival time must use the 24-hour HH:mm format.' };
  }

  if (sanitized.requiredUnit !== undefined && !Object.hasOwn(beds, sanitized.requiredUnit)) {
    return { error: 'Select a unit with bed capacity.' };
  }
  if (
    sanitized.treatmentStatus !== undefined &&
    !validTreatmentStatuses.has(sanitized.treatmentStatus)
  ) {
    return { error: 'Select a valid treatment status.' };
  }

  const previousStatus = patient.treatmentStatus;
  const previousUnit = patient.requiredUnit;
  const targetStatus = sanitized.treatmentStatus ?? previousStatus;
  const targetUnit = sanitized.requiredUnit ?? previousUnit;
  Object.assign(patient, sanitized);
  patient.treatmentStatus = targetStatus;
  patient.requiredUnit = targetUnit;
  patient.triageCategory = calculateSeverityCategory(patient.severity);

  if (
    previousStatus === 'Under Treatment' &&
    (targetStatus !== 'Under Treatment' || targetUnit !== previousUnit)
  ) {
    patient.treatmentStatus = previousStatus;
    patient.requiredUnit = previousUnit;
    releaseBed(patient);
    patient.treatmentStatus = targetStatus;
    patient.requiredUnit = targetUnit;
  }

  if (patient.treatmentStatus === 'Under Treatment') {
    if (previousStatus !== 'Under Treatment' || targetUnit !== previousUnit) {
      if ((beds[patient.requiredUnit] ?? 0) <= 0) {
        return { error: `No suitable bed is available for ${patient.requiredUnit}.` };
      }
      patient.assignedBed = findAvailableBed(patient.requiredUnit);
      if (!patient.assignedBed) {
        return { error: `No available bed could be assigned in ${patient.requiredUnit}.` };
      }
      beds[patient.requiredUnit] -= 1;
    }
    patient.bedStatus = 'Assigned';
  } else if (patient.treatmentStatus === 'Queued') {
    patient.assignedBed = 'None';
    patient.bedStatus = 'Waiting';
  } else {
    patient.assignedBed = 'None';
    patient.bedStatus = previousStatus === 'Under Treatment' ? 'Released' : 'None';
  }

  syncWaitingQueue();
  saveAction(
    'update',
    patient.id,
    beforeState,
    captureDomainSnapshot(),
    `Updated patient ${patient.name}.`
  );
  return { patient, message: 'Patient record updated.' };
}

function deletePatient(id) {
  const patient = patientStore.findById(id);
  if (!patient) {
    return { error: 'Patient not found.' };
  }

  const beforeState = captureDomainSnapshot();
  releaseBed(patient);
  patientStore.removeById(id);
  removeFromQueueById(id);
  saveAction(
    'delete',
    id,
    beforeState,
    captureDomainSnapshot(),
    `Removed patient ${patient.name}.`
  );
  return { message: `Patient ${id} removed successfully.` };
}

function treatNextPatient() {
  const recommendation = getNextRecommendedPatient();
  if (!recommendation.patient) {
    return { error: 'No patient waiting to be treated.' };
  }

  if (!recommendation.feasible) {
    return {
      message: recommendation.message,
      patient: recommendation.patient,
      status: 'queued'
    };
  }

  const patient = patientStore.findById(recommendation.patient.id);
  if (!patient) {
    return { error: 'Selected patient record could not be found.' };
  }

  const unit = patient.requiredUnit || 'Observation';
  const beforeState = captureDomainSnapshot();

  patient.treatmentStatus = 'Under Treatment';
  patient.bedStatus = 'Assigned';
  patient.assignedBed = findAvailableBed(unit);
  if (!patient.assignedBed) {
    return { error: `No available bed could be assigned in ${unit}.` };
  }
  removeFromQueueById(patient.id);
  beds[unit] -= 1;
  const afterState = captureDomainSnapshot();
  saveAction('triage', patient.id, beforeState, afterState, `Treated patient ${patient.name}.`);

  return {
    patient,
    message: `${patient.name} has been selected for treatment in ${unit}.`,
    status: 'treated'
  };
}

function undoRecentAction() {
  const action = actionHistory.pop();
  if (!action) {
    return { message: 'No actions to undo.' };
  }

  if (action.beforeState?.version === 1) {
    restoreDomainSnapshot(action.beforeState);
  } else if (action.beforeState) {
    const existing = patientStore.findById(action.patientId);
    if (existing) {
      Object.assign(existing, action.beforeState);
    } else {
      patientStore.insert(action.beforeState);
      patientTree.insert(action.beforeState.id, action.beforeState);
    }
    syncWaitingQueue();
  }

  return {
    message: action.actionType === 'register'
      ? 'Last registration was undone.'
      : `${action.message || 'Last action'} undone.`,
  };
}

function getRoute(fromUnit, toUnit) {
  const route = hospitalGraph.shortestPath(fromUnit, toUnit);
  return route.length ? route : [];
}

function evaluateExpression(expression) {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new Error('Enter an arithmetic expression.');
  }

  const compact = expression.replace(/\s+/g, '');
  if (compact.length > 200) {
    throw new Error('Expressions must be at most 200 characters.');
  }

  const tokens = (expression.match(/\s+|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]/g) || [])
    .filter((token) => !/^\s+$/.test(token));
  if (!tokens.length || tokens.join('') !== compact) {
    throw new Error('Use numbers, parentheses, and the +, -, *, / operators only.');
  }

  const operators = new Stack();
  const values = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, 'u+': 3, 'u-': 3 };
  let expectsOperand = true;

  const applyTopOperator = () => {
    const operator = operators.pop();
    if (operator === 'u+' || operator === 'u-') {
      if (!values.length) throw new Error('The expression is incomplete.');
      const value = values.pop();
      values.push(operator === 'u-' ? -value : value);
      return;
    }

    if (values.length < 2) throw new Error('The expression is incomplete.');
    const right = values.pop();
    const left = values.pop();
    let result;
    if (operator === '+') result = left + right;
    else if (operator === '-') result = left - right;
    else if (operator === '*') result = left * right;
    else {
      if (right === 0) throw new Error('Division by zero is not allowed.');
      result = left / right;
    }
    if (!Number.isFinite(result)) throw new Error('The result is outside the supported numeric range.');
    values.push(result);
  };

  for (const token of tokens) {
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      if (!expectsOperand) throw new Error('Add an operator between numbers.');
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error('Enter a finite number.');
      values.push(value);
      expectsOperand = false;
      continue;
    }

    if (token === '(') {
      if (!expectsOperand) throw new Error('Add an operator before the opening parenthesis.');
      operators.push(token);
      expectsOperand = true;
      continue;
    }

    if (token === ')') {
      if (expectsOperand) throw new Error('The expression is incomplete.');
      while (!operators.isEmpty() && operators.peek() !== '(') applyTopOperator();
      if (operators.isEmpty()) throw new Error('The parentheses do not match.');
      operators.pop();
      if (operators.peek() === 'u+' || operators.peek() === 'u-') applyTopOperator();
      expectsOperand = false;
      continue;
    }

    if (expectsOperand) {
      if (token !== '+' && token !== '-') {
        throw new Error('Place a number before this operator.');
      }
      operators.push(token === '+' ? 'u+' : 'u-');
      continue;
    }

    while (
      !operators.isEmpty() &&
      operators.peek() !== '(' &&
      precedence[operators.peek()] >= precedence[token]
    ) {
      applyTopOperator();
    }
    operators.push(token);
    expectsOperand = true;
  }

  if (expectsOperand) throw new Error('The expression is incomplete.');
  while (!operators.isEmpty()) {
    if (operators.peek() === '(') throw new Error('The parentheses do not match.');
    applyTopOperator();
  }
  if (values.length !== 1) throw new Error('The expression is invalid.');
  return values[0];
}

function bootstrapPatients() {
  const samplePatients = [
    { id: 'ER-101', name: 'Asha', age: 29, gender: 'F', symptoms: 'Chest pain', severity: 9, requiredUnit: 'ICU', arrivalTime: '09:10' },
    { id: 'ER-102', name: 'Manoj', age: 52, gender: 'M', symptoms: 'Breathing difficulty', severity: 7, requiredUnit: 'Emergency', arrivalTime: '09:15' },
    { id: 'ER-103', name: 'Zara', age: 15, gender: 'F', symptoms: 'Fever', severity: 4, requiredUnit: 'Observation', arrivalTime: '09:20' },
    { id: 'ER-104', name: 'Kiran', age: 63, gender: 'M', symptoms: 'Severe bleeding', severity: 8, requiredUnit: 'Ward', arrivalTime: '09:25' },
    { id: 'ER-105', name: 'Tina', age: 41, gender: 'F', symptoms: 'Fracture', severity: 5, requiredUnit: 'Ward', arrivalTime: '09:30' },
  ];

  samplePatients.forEach((patient) => {
    const result = registerPatient(patient);
    if (!result.error) {
      const record = patientStore.findById(patient.id);
      if (record) {
        record.treatmentStatus = 'Queued';
        record.bedStatus = 'Waiting';
      }
    }
  });
}

function capturePersistentState() {
  return {
    patients: getCurrentPatients().map(clonePatient),
    beds: { ...beds },
    queueIds: getQueueList().map((patient) => patient.id),
    history: actionHistory.toArray().reverse().map((action) => JSON.parse(JSON.stringify(action))),
  };
}

function restoreDomainSnapshot(savedState) {
  patientStore = new LinkedList();
  waitingQueue = new Queue();
  patientTree = new PatientBST();

  for (const patient of savedState.patients) {
    patientStore.insert(patient);
    patientTree.insert(patient.id, patient);
  }

  const patientsById = new Map(getCurrentPatients().map((patient) => [patient.id, patient]));
  for (const id of savedState.queueIds || []) {
    const patient = patientsById.get(id);
    if (patient?.treatmentStatus === 'Queued') {
      waitingQueue.enqueue(patient);
      patientsById.delete(id);
    }
  }
  for (const patient of patientsById.values()) {
    if (patient.treatmentStatus === 'Queued') waitingQueue.enqueue(patient);
  }

  for (const unit of Object.keys(beds)) {
    delete beds[unit];
  }
  Object.assign(beds, savedState.beds);
}

function restorePersistentState(savedState) {
  restoreDomainSnapshot(savedState);
  actionHistory = new Stack();
  for (const action of savedState.history || []) {
    actionHistory.push(action);
  }
}

function rebuildPatientTree() {
  patientTree = new PatientBST();
  const patients = getCurrentPatients();
  for (const patient of patients) {
    patientTree.insert(patient.id, patient);
  }
  sortedPatientIndex = patients.sort((left, right) => comparePatientIds(left.id, right.id));
}

async function applyPersistedMutation(mutate) {
  const previousState = capturePersistentState();
  const result = mutate();
  if (result.error) {
    restorePersistentState(previousState);
    return result;
  }

  try {
    rebuildPatientTree();
    await saveState(capturePersistentState());
    return result;
  } catch (error) {
    restorePersistentState(previousState);
    throw error;
  }
}

function persistMutation(mutate) {
  const pending = mutationQueue.then(() => applyPersistedMutation(mutate));
  mutationQueue = pending.catch(() => {});
  return pending;
}

async function startServer() {
  await initializeDatabase();

  if (await getSetting('sample_data_initialized') === null) {
    if (await countPatients() === 0) {
      bootstrapPatients();
      await saveState(capturePersistentState());
    }
    await setSetting('sample_data_initialized', 'true');
  }

  restorePersistentState(await loadState());
  rebuildPatientTree();
  app.listen(PORT, () => {
    console.log(`ERFlow server is running on http://localhost:${PORT}`);
  });
}

app.get('/api/summary', (req, res) => {
  res.json({
    patients: getCurrentPatients(),
    queue: getQueueList(),
    priorityList: getPriorityList(),
    beds,
    bst: patientTree.inorder(),
    treeTraversals: {
      inorder: patientTree.inorder().map((patient) => patient.id),
      preorder: patientTree.preorder().map((patient) => patient.id),
      postorder: patientTree.postorder().map((patient) => patient.id),
    },
    searchIndex: sortedPatientIndex.map((patient) => patient.id),
    recommendation: getNextRecommendedPatient(),
    units: Object.keys(hospitalGraph.adjacency),
    history: actionHistory.toArray().map((item) => ({
      actionType: item.actionType,
      patientId: item.patientId,
      message: item.message,
    })),
  });
});

app.get('/api/auth/session', (req, res) => {
  const sessionToken = (req.headers.cookie || '')
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const session = sessionToken && sessions.get(sessionToken);

  if (!session || session.expiresAt <= Date.now()) {
    if (sessionToken) sessions.delete(sessionToken);
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }

  return res.json({ account: session.account });
});

app.post('/api/auth/logout', (req, res) => {
  const sessionToken = (req.headers.cookie || '')
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (sessionToken) sessions.delete(sessionToken);

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  );
  return res.json({ message: 'Signed out.' });
});

app.post('/api/auth/register', async (req, res, next) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const username = String(body.username || '').trim().toLowerCase();
  const password = body.password;

  if (!name || name.length > 100 || !/^[a-z0-9._-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Enter a name and a username with 3-30 letters, numbers, dots, underscores, or hyphens.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (username === 'admin') {
    return res.status(409).json({ error: 'That username is already in use.' });
  }

  try {
    const passwordSalt = crypto.randomBytes(16);
    const passwordHash = await derivePassword(password, passwordSalt, 100000, 32, 'sha256');
    const created = await createStaffAccount({
      username,
      name,
      passwordSalt: passwordSalt.toString('hex'),
      passwordHash: passwordHash.toString('hex'),
    });
    if (!created) {
      return res.status(409).json({ error: 'That username is already in use.' });
    }
    return res.status(201).json({ message: `Account created for ${name}. Sign in to continue.` });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const body = req.body || {};
  const username = String(body.username || '').trim().toLowerCase();
  const password = body.password;
  if (typeof password !== 'string') {
    return res.status(401).json({ error: 'Username or password is incorrect.' });
  }

  try {
    let isAuthenticated = username === 'admin' && password === 'admin123';
    let accountName = username === 'admin' ? 'Administrator' : '';
    if (!isAuthenticated) {
      const account = await getStaffAccount(username);
      if (account) {
        const passwordSalt = Buffer.from(account.passwordSalt, 'hex');
        const storedHash = Buffer.from(account.passwordHash, 'hex');
        const passwordHash = await derivePassword(password, passwordSalt, 100000, 32, 'sha256');
        isAuthenticated =
          storedHash.length === passwordHash.length &&
          crypto.timingSafeEqual(storedHash, passwordHash);
        if (isAuthenticated) accountName = account.name;
      }
    }

    if (!isAuthenticated) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const account = { username, name: accountName };
    sessions.set(sessionToken, {
      account,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
    );
    return res.json({ message: 'Signed in.', account });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/patients', (req, res) => {
  res.json(getCurrentPatients());
});

app.get('/api/patients/export.csv', (req, res) => {
  const columns = [
    'id',
    'name',
    'age',
    'gender',
    'symptoms',
    'severity',
    'arrivalTime',
    'requiredUnit',
    'treatmentStatus',
    'bedStatus',
    'triageCategory',
    'assignedBed',
  ];
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [
    columns.map(escapeCsv).join(','),
    ...getCurrentPatients().map((patient) =>
      columns.map((column) => escapeCsv(patient[column])).join(',')
    ),
  ];

  res
    .type('text/csv')
    .set('Content-Disposition', 'attachment; filename="erflow-patients.csv"')
    .send(rows.join('\r\n'));
});

app.get('/api/patients/search', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const mode = String(req.query.mode || 'linear').toLowerCase();
  if (!['linear', 'binary', 'bst'].includes(mode)) {
    return res.status(400).json({ error: 'Choose linear, binary, or BST search.' });
  }
  if (!query) return res.json(getCurrentPatients());

  if (mode === 'binary') {
    const patient = binarySearchPatient(query);
    return res.json(patient ? [patient] : []);
  }
  if (mode === 'bst') {
    const patient = patientTree.find(String(req.query.q || '').trim());
    return res.json(patient ? [patient] : []);
  }

  const results = getCurrentPatients().filter((patient) => {
    return patient.id.toLowerCase().includes(query) || patient.name.toLowerCase().includes(query);
  });

  return res.json(results);
});

app.post('/api/algorithms/evaluate-expression', (req, res) => {
  try {
    const result = evaluateExpression(req.body?.expression);
    return res.json({ result });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/api/patients/:id', (req, res) => {
  const patient = patientTree.find(req.params.id);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found.' });
  }
  return res.json(patient);
});

app.post('/api/patients', async (req, res, next) => {
  try {
    const result = await persistMutation(() => registerPatient(req.body));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/patients/:id', async (req, res, next) => {
  try {
    const result = await persistMutation(() => updatePatient(req.params.id, req.body));
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/patients/:id', async (req, res, next) => {
  try {
    const result = await persistMutation(() => deletePatient(req.params.id));
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/queue', (req, res) => {
  res.json(getQueueList());
});

app.get('/api/priority', (req, res) => {
  res.json(getPriorityList());
});

app.get('/api/beds', (req, res) => {
  res.json(beds);
});

app.get('/api/route', (req, res) => {
  const fromUnit = req.query.from;
  const toUnit = req.query.to;

  if (!fromUnit || !toUnit) {
    return res.status(400).json({ error: 'Both source and destination units are required.' });
  }

  const route = getRoute(fromUnit, toUnit);
  if (!route.length) {
    return res.status(404).json({ error: 'No route found between selected units.' });
  }

  return res.json({ route });
});

app.post('/api/triage/select-next', async (req, res, next) => {
  try {
    const result = await persistMutation(treatNextPatient);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/undo', async (req, res, next) => {
  try {
    const result = await persistMutation(undoRecentAction);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'The request could not be completed.' });
});

startServer().catch(async (error) => {
  console.error('Unable to start ERFlow. Check the MySQL connection settings and ensure the emergency database exists.', error);
  try {
    await closeDatabase();
  } catch (closeError) {
    console.error('Unable to close the MySQL connection pool:', closeError);
  }
  process.exitCode = 1;
});
