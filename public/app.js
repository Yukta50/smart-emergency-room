(() => {
const state = {
  patients: [],
  queue: [],
  priorityList: [],
  beds: {},
  recommendation: null,
};

const registerForm = document.getElementById('register-form');
const updateForm = document.getElementById('update-form');
const searchBox = document.getElementById('search-box');
const searchMode = document.getElementById('search-mode');
const queueTable = document.getElementById('queue-table');
const priorityTable = document.getElementById('priority-table');
const bedTable = document.getElementById('bed-table');
const patientTable = document.getElementById('patient-table');
const recommendationBox = document.getElementById('recommendation-box');
const routeOutput = document.getElementById('route-output');
const registerMessage = document.getElementById('register-message');
const updateMessage = document.getElementById('update-message');
const triageMessage = document.getElementById('triage-message');
const themeToggle = document.getElementById('theme-toggle');
const expressionForm = document.getElementById('expression-form');
const expressionOutput = document.getElementById('expression-output');
let patientSearchSequence = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function switchView(viewName) {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });

  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === viewName);
  });
}

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  themeToggle.textContent = isDark ? '☀️ Light' : '🌙 Theme';
});

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (response.status === 401) {
    sessionStorage.removeItem('erflow-demo-authenticated');
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      document.querySelectorAll('.auth-screen').forEach((screen) => {
        screen.classList.toggle('active', screen.dataset.authScreen === 'login');
      });
      if (url !== '/api/auth/session') {
        document.getElementById('login-message').textContent = 'Your session expired. Please sign in again.';
      }
    }
  }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function renderQueueTable(rows) {
  if (!rows.length) {
    queueTable.innerHTML = '<tr><td colspan="4">No patients waiting.</td></tr>';
    return;
  }

  queueTable.innerHTML = rows
    .map(
      (patient) => `
        <tr>
          <td>${escapeHtml(patient.id)}</td>
          <td>${escapeHtml(patient.name)}</td>
          <td>${escapeHtml(patient.severity)}</td>
          <td>${escapeHtml(patient.requiredUnit)}</td>
        </tr>
      `
    )
    .join('');
}

function renderPriorityTable(rows) {
  if (!rows.length) {
    priorityTable.innerHTML = '<tr><td colspan="4">No priority data available.</td></tr>';
    return;
  }

  priorityTable.innerHTML = rows
    .map(
      (patient) => `
        <tr>
          <td>${escapeHtml(patient.id)}</td>
          <td>${escapeHtml(patient.name)}</td>
          <td>${escapeHtml(patient.severity)}</td>
          <td>${escapeHtml(patient.arrivalTime)}</td>
        </tr>
      `
    )
    .join('');
}

function renderBedTable(data) {
  const rows = Object.entries(data || {});
  if (!rows.length) {
    bedTable.innerHTML = '<tr><td colspan="2">No bed data available.</td></tr>';
    return;
  }

  bedTable.innerHTML = rows
    .map(
      ([unit, count]) => `
        <tr>
          <td>${escapeHtml(unit)}</td>
          <td>${escapeHtml(count)}</td>
        </tr>
      `
    )
    .join('');
}

function renderPatientTable(rows) {
  const query = searchBox.value.trim().toLowerCase();
  const filteredRows = query
    ? rows.filter(
        (patient) =>
          patient.id.toLowerCase().includes(query) || patient.name.toLowerCase().includes(query)
      )
    : rows;

  if (!filteredRows.length) {
    patientTable.innerHTML = '<tr><td colspan="6">No matching patient records.</td></tr>';
    return;
  }

  patientTable.innerHTML = filteredRows
    .map(
      (patient) => `
        <tr>
          <td>${escapeHtml(patient.id)}</td>
          <td>${escapeHtml(patient.name)}</td>
          <td>${escapeHtml(patient.age)}</td>
          <td>${escapeHtml(patient.severity)}</td>
          <td>${escapeHtml(patient.requiredUnit)}</td>
          <td>${escapeHtml(patient.treatmentStatus || 'Queued')}</td>
        </tr>
      `
    )
    .join('');
}

function renderRecommendation(recommendation) {
  if (!recommendation || !recommendation.patient) {
    recommendationBox.textContent = 'No patient waiting for treatment.';
    const spotlightName = document.getElementById('spotlight-name');
    const spotlightDetail = document.getElementById('spotlight-detail');
    if (spotlightName && spotlightDetail) {
      spotlightName.textContent = 'No active case';
      spotlightDetail.textContent = 'Waiting queue is empty';
    }
    return;
  }

  recommendationBox.innerHTML = `
    <strong>${escapeHtml(recommendation.patient.name)}</strong> (${escapeHtml(recommendation.patient.id)})<br />
    Severity: ${escapeHtml(recommendation.patient.severity)}<br />
    Required Unit: ${escapeHtml(recommendation.patient.requiredUnit)}<br />
    Message: ${escapeHtml(recommendation.message)}
  `;

  const spotlightName = document.getElementById('spotlight-name');
  const spotlightDetail = document.getElementById('spotlight-detail');
  if (spotlightName && spotlightDetail) {
    spotlightName.textContent = recommendation.patient.name;
    spotlightDetail.textContent = `${recommendation.patient.id} • ${recommendation.patient.triageCategory} • ${recommendation.patient.requiredUnit}`;
  }
}

function renderStructureSummary(data) {
  const structureContainer = document.getElementById('structure-summary');
  if (!structureContainer) return;

  const cards = [
    {
      tag: 'Linked List',
      title: 'Patient records',
      text: `Each patient is stored as a node in a linked list, allowing sequential traversal of the hospital registry in insertion order. Current records: ${data.patients?.length || 0}.`,
    },
    {
      tag: 'Queue',
      title: 'Waiting list',
      text: `Patients wait in FIFO order using a queue. Triage applies severity and arrival-time priority when choosing a patient from this waiting list. Active waiting count: ${data.queue?.length || 0}.`,
    },
    {
      tag: 'Stack',
      title: 'Undo history',
      text: `Register, update, delete, triage, and discharge actions are recorded on a stack. Undo restores the previous patient, queue, and bed snapshot.`,
    },
    {
      tag: 'BST',
      title: 'Patient lookup',
      text: `Patient IDs are stored in a binary search tree. Exact ID lookup follows the tree, and in-order traversal returns IDs in sorted order.`,
    },
    {
      tag: 'Graph',
      title: 'Hospital route map',
      text: `Units are nodes in a graph, and BFS finds the shortest route between departments such as Reception → Triage → ICU or Ward → Discharge.`,
    },
  ];

  structureContainer.innerHTML = cards
    .map(
      (card) => `
        <div class="structure-card">
          <span class="tag">${card.tag}</span>
          <h3>${card.title}</h3>
          <p>${card.text}</p>
        </div>
      `
    )
    .join('');
}

function renderAlgorithmSummary(data) {
  const algorithmContainer = document.getElementById('algorithm-summary');
  if (!algorithmContainer) return;

  const topPriority = (data.priorityList || [])[0];
  const nextRecommendation = data.recommendation?.patient;
  const traversals = data.treeTraversals || {};
  const traversalText = (traversal) =>
    (traversals[traversal] || []).map(escapeHtml).join(' → ') || 'No patient IDs yet.';

  const cards = [
    {
      tag: 'Sort',
      title: 'Priority sorting',
      text: topPriority
        ? `Merge sort runs in O(n log n) time and O(n) extra space. It orders active cases by descending severity, breaking ties by earlier arrival. Current top case is ${escapeHtml(topPriority.name)} (${escapeHtml(topPriority.severity)}) with arrival ${escapeHtml(topPriority.arrivalTime)}.`
        : 'No priority data is available at the moment.',
    },
    {
      tag: 'Search',
      title: 'Search and complexity',
      text: `Linear ID/name search is O(n); binary search on the maintained ID index is O(log n); BST lookup is O(log n) on average and O(n) in the worst case.`,
    },
    {
      tag: 'Tree',
      title: 'Binary search tree traversals',
      text: `In-order: ${traversalText('inorder')} | Pre-order: ${traversalText('preorder')} | Post-order: ${traversalText('postorder')}`,
    },
    {
      tag: 'Greedy',
      title: 'Next treatment choice',
      text: nextRecommendation
        ? `The greedy strategy selects the highest-priority waiting patient with an available bed: ${escapeHtml(nextRecommendation.name)} in ${escapeHtml(nextRecommendation.requiredUnit)}.`
        : 'No eligible patient is available for treatment right now.',
    },
    {
      tag: 'BFS',
      title: 'Shortest path routing',
      text: `Hospital departments are connected in a graph, and breadth-first search calculates the shortest travel route between units for staff flow.`,
    },
  ];

  algorithmContainer.innerHTML = cards
    .map(
      (card) => `
        <div class="structure-card">
          <span class="tag">${card.tag}</span>
          <h3>${card.title}</h3>
          <p>${card.text}</p>
        </div>
      `
    )
    .join('');
}

function updateSummaryStats(data) {
  const totalPatients = (data.patients || []).length;
  const waitingPatients = (data.queue || []).length;
  const priorityPatients = (data.priorityList || []).length;
  const totalAvailableBeds = Object.values(data.beds || {}).reduce((sum, value) => sum + Number(value || 0), 0);

  document.getElementById('total-patients').textContent = totalPatients;
  document.getElementById('total-waiting').textContent = waitingPatients;
  document.getElementById('total-priority').textContent = priorityPatients;
  document.getElementById('total-beds').textContent = totalAvailableBeds;
}

function renderDashboard(data) {
  state.patients = data.patients || [];
  state.queue = data.queue || [];
  state.priorityList = data.priorityList || [];
  state.beds = data.beds || {};
  state.recommendation = data.recommendation || null;

  updateSummaryStats(data);
  renderQueueTable(state.queue);
  renderPriorityTable(state.priorityList);
  renderBedTable(state.beds);
  if (searchBox.value.trim()) {
    searchPatients();
  } else {
    renderPatientTable(state.patients);
  }
  renderRecommendation(state.recommendation);
  renderStructureSummary(data);
  renderAlgorithmSummary(data);
}

async function searchPatients() {
  const query = searchBox.value.trim();
  const requestId = ++patientSearchSequence;
  if (!query) {
    renderPatientTable(state.patients);
    return;
  }

  const parameters = new URLSearchParams({ q: query, mode: searchMode.value });
  try {
    const results = await fetchJson(`/api/patients/search?${parameters}`);
    if (requestId === patientSearchSequence) renderPatientTable(results);
  } catch (error) {
    if (requestId === patientSearchSequence) {
      patientTable.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
    }
  }
}

async function loadDashboard() {
  try {
    const session = await fetchJson('/api/auth/session');
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');
    const accountName = document.getElementById('staff-name');
    if (accountName) accountName.textContent = session.account.name;
    const data = await fetchJson('/api/summary');
    renderDashboard(data);
  } catch (error) {
    if (error.message !== 'Please sign in to continue.') {
      console.error('Unable to load the ERFlow dashboard:', error);
      registerMessage.textContent = error.message;
    }
  }
}

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(registerForm));

  try {
    const response = await fetchJson('/api/patients', {
      method: 'POST',
      body: JSON.stringify(formData),
    });

    registerMessage.textContent = response.message || 'Patient registered.';
    registerForm.reset();
    await loadDashboard();
  } catch (error) {
    registerMessage.textContent = error.message;
  }
});

updateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const patientId = document.getElementById('update-id').value.trim();
  const payload = {};

  const severityValue = document.getElementById('update-severity').value;
  const statusValue = document.getElementById('update-status').value;
  const unitValue = document.getElementById('update-unit').value;

  if (severityValue) payload.severity = Number(severityValue);
  if (statusValue) payload.treatmentStatus = statusValue;
  if (unitValue) payload.requiredUnit = unitValue;

  try {
    const response = await fetchJson(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    updateMessage.textContent = response.message || 'Patient updated.';
    updateForm.reset();
    await loadDashboard();
  } catch (error) {
    updateMessage.textContent = error.message;
  }
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  const patientId = document.getElementById('update-id').value.trim();
  if (!patientId) {
    updateMessage.textContent = 'Enter a patient ID to delete.';
    return;
  }

  try {
    const response = await fetchJson(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: 'DELETE',
    });
    updateMessage.textContent = response.message || 'Patient removed.';
    updateForm.reset();
    await loadDashboard();
  } catch (error) {
    updateMessage.textContent = error.message;
  }
});

searchBox.addEventListener('input', searchPatients);
searchMode.addEventListener('change', searchPatients);

document.getElementById('route-btn').addEventListener('click', async () => {
  const fromUnit = document.getElementById('from-unit').value;
  const toUnit = document.getElementById('to-unit').value;

  try {
    const result = await fetchJson(`/api/route?from=${encodeURIComponent(fromUnit)}&to=${encodeURIComponent(toUnit)}`);
    routeOutput.textContent = `Route: ${result.route.join(' -> ')}`;
  } catch (error) {
    routeOutput.textContent = error.message;
  }
});

document.getElementById('triage-btn').addEventListener('click', async () => {
  try {
    const result = await fetchJson('/api/triage/select-next', { method: 'POST' });
    triageMessage.textContent = result.message || 'Next patient selected.';
    await loadDashboard();
  } catch (error) {
    triageMessage.textContent = error.message;
  }
});

document.getElementById('undo-btn').addEventListener('click', async () => {
  try {
    const result = await fetchJson('/api/undo', { method: 'POST' });
    registerMessage.textContent = result.message || 'Undo complete.';
    await loadDashboard();
  } catch (error) {
    registerMessage.textContent = error.message;
  }
});

expressionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const expression = document.getElementById('expression-input').value;
  try {
    const result = await fetchJson('/api/algorithms/evaluate-expression', {
      method: 'POST',
      body: JSON.stringify({ expression }),
    });
    expressionOutput.textContent = `Result: ${result.result}`;
  } catch (error) {
    expressionOutput.textContent = error.message;
  }
});

window.addEventListener('erflow:authenticated', loadDashboard);

loadDashboard();
})();
