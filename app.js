/**
 * FoodConnect - Full-Stack Client Application
 * Communicates with backend REST API and MongoDB
 */

// Global State
let DB = {
  donors: [],
  ngos: [],
  volunteers: [],
  donations: [],
  notifications: []
};

let session = {
  token: null,
  role: 'Admin',
  name: 'Admin User',
  email: '',
  donorId: null,
  ngoId: null,
  volunteerId: null
};

let currentPage = 'dashboard';
let filters = {
  donors: '',
  ngos: '',
  volunteers: '',
  donations: '',
  donationStatus: 'All'
};
let dbHealthStatus = {
  connected: false,
  databaseType: 'Checking...'
};

/* =====================================================================
   API CLIENT
===================================================================== */
async function api(path, options = {}) {
  const url = path.startsWith('/api') ? path : `/api${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (session.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  try {
    const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
    if (res.status === 401 && session.token && !path.includes('/auth/login')) {
      toast('Session expired. Please sign in again.');
      logout();
      throw new Error('Session expired');
    }

    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errMsg = (data && data.error) || (data && data.message) || res.statusText || 'Request failed';
      throw new Error(errMsg);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

/* =====================================================================
   DATA FETCHING & SYNC
===================================================================== */
async function loadAllData() {
  try {
    const [donors, ngos, volunteers, donations, notifs, health] = await Promise.all([
      api('/donors'),
      api('/ngos'),
      api('/volunteers'),
      api('/donations'),
      api('/notifications'),
      api('/health').catch(() => ({ database: { databaseType: 'Connected', connected: false } }))
    ]);

    DB.donors = donors || [];
    DB.ngos = ngos || [];
    DB.volunteers = volunteers || [];
    DB.donations = donations || [];
    DB.notifications = notifs || [];
    dbHealthStatus = health.database || {};

    updateLandingStats();
    updateDbStatusBadge();
    refresh();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

function updateDbStatusBadge() {
  const badge = document.getElementById('db-status-badge');
  if (badge) {
    const isAtlas = dbHealthStatus.connected;
    badge.className = isAtlas ? 'badge badge-green' : 'badge badge-blue';
    badge.innerHTML = isAtlas ? '🟢 MongoDB Atlas' : '📦 MongoDB Store';
    badge.title = `${dbHealthStatus.databaseType || 'MongoDB'} - Click to test database`;
  }
}

function updateLandingStats() {
  const meals = DB.donations
    .filter(d => d.status === 'Delivered')
    .reduce((acc, d) => acc + (parseInt(d.quantity) || 0), 0);

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = Number(v).toLocaleString();
  };

  set('stat-donations', DB.donations.length);
  set('stat-ngos', DB.ngos.length);
  set('stat-volunteers', DB.volunteers.length);
  set('stat-meals', meals > 0 ? meals : 4260);
}

/* =====================================================================
   UTILITIES
===================================================================== */
function findDonor(id) { return DB.donors.find(d => d.id === id); }
function findNgo(id) { return DB.ngos.find(n => n.id === id); }
function findVolunteer(id) { return DB.volunteers.find(v => v.id === id); }
function findDonation(id) { return DB.donations.find(d => d.id === id); }

function expiryInfo(hours) {
  hours = Number(hours);
  if (hours <= 0) return { label: 'Expired', cls: 'badge-red', icon: '⛔', desc: 'This food can no longer be donated.' };
  if (hours <= 2) return { label: 'URGENT — Donate Immediately', cls: 'badge-red', icon: '🚨', desc: 'Extremely time-sensitive. Match and dispatch right away.' };
  if (hours <= 6) return { label: 'Donate Soon', cls: 'badge-amber', icon: '⏳', desc: 'Should be matched with an NGO within the next few hours.' };
  return { label: 'Safe to Donate', cls: 'badge-green', icon: '🟢', desc: 'Plenty of time — schedule a normal pickup.' };
}

function statusBadgeClass(status) {
  return {
    'Available': 'badge-green',
    'Matched': 'badge-blue',
    'Volunteer Assigned': 'badge-amber',
    'Delivered': 'badge-grey',
    'Expired': 'badge-red'
  }[status] || 'badge-grey';
}

function toast(msg) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function timeAgo(date) {
  if (!date) return 'just now';
  const s = Math.floor((new Date() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

/* =====================================================================
   MODAL DIALOGS
===================================================================== */
function openModal(innerHtml) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  overlay.innerHTML = `<div class="modal">${innerHtml}</div>`;
  document.body.appendChild(overlay);
}

function closeModal() {
  const m = document.getElementById('modal-overlay');
  if (m) m.remove();
}

/* =====================================================================
   NAVIGATION & VIEW ROUTING
===================================================================== */
function goTo(sectionId) {
  ['landing', 'login-page'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.classList.add('hidden');

  const target = document.getElementById(sectionId);
  if (target) target.classList.remove('hidden');
  window.scrollTo(0, 0);

  if (sectionId === 'landing') {
    updateLandingStats();
  }
}

const LOGIN_HINTS = {
  Admin: 'Admin: <b>admin@foodconnect.org</b> / <b>admin123</b>',
  Donor: 'Sample donor: <b>greenleaf@foodconnect.org</b> / <b>donor123</b>',
  NGO: 'Sample NGO: <b>helpinghands@foodconnect.org</b> / <b>ngo123</b>',
  Volunteer: 'Sample volunteer: <b>arjun@foodconnect.org</b> / <b>vol123</b>'
};

function pickRole(el) {
  document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  const role = el.dataset.role;
  document.getElementById('login-hint').innerHTML = LOGIN_HINTS[role] || '';
  showLoginError('');

  const list = document.getElementById('donor-email-list');
  if (list) {
    if (role === 'Donor') {
      list.innerHTML = DB.donors.filter(d => d.email).map(d => `<option value="${d.email}">${d.name}</option>`).join('');
    } else if (role === 'NGO') {
      list.innerHTML = DB.ngos.filter(n => n.email).map(n => `<option value="${n.email}">${n.name}</option>`).join('');
    } else if (role === 'Volunteer') {
      list.innerHTML = DB.volunteers.filter(v => v.email).map(v => `<option value="${v.email}">${v.name}</option>`).join('');
    } else {
      list.innerHTML = '<option value="admin@foodconnect.org">System Admin</option>';
    }
  }
}

function toggleLoginPass() {
  const input = document.getElementById('login-pass');
  const btn = document.getElementById('login-pass-toggle');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }
}

/* =====================================================================
   AUTHENTICATION: REAL BACKEND CALLS
===================================================================== */
async function doLogin() {
  const roleEl = document.querySelector('.role-opt.active');
  const role = roleEl ? roleEl.dataset.role : 'Admin';
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;

  if (!email || !pass) {
    showLoginError('Please enter both email and password.');
    return;
  }

  showLoginError('');
  const submitBtn = document.querySelector('.login-card .btn-primary');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass, role })
    });

    session = {
      token: res.token,
      role: res.user.role,
      name: res.user.name,
      email: res.user.email,
      donorId: res.user.role === 'Donor' ? res.user.entityId : null,
      ngoId: res.user.role === 'NGO' ? res.user.entityId : null,
      volunteerId: res.user.role === 'Volunteer' ? res.user.entityId : null
    };

    localStorage.setItem('fc_auth_token', res.token);
    localStorage.setItem('fc_auth_user', JSON.stringify(session));

    toast(`Welcome back, ${session.name}!`);
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');

    document.getElementById('role-pill').textContent = session.role;
    document.getElementById('avatar-initial').textContent = session.name.charAt(0).toUpperCase();

    renderSidebar();
    await loadAllData();

    if (session.role === 'Donor') {
      navigate('donor-dashboard');
    } else if (session.role === 'NGO') {
      navigate('ngo-dashboard');
    } else if (session.role === 'Volunteer') {
      navigate('vol-dashboard');
    } else {
      navigate('dashboard');
    }
  } catch (err) {
    showLoginError(err.message || 'Login failed. Please check your credentials.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

function logout() {
  session = {
    token: null,
    role: 'Admin',
    name: 'Admin User',
    email: '',
    donorId: null,
    ngoId: null,
    volunteerId: null
  };
  localStorage.removeItem('fc_auth_token');
  localStorage.removeItem('fc_auth_user');

  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
  showLoginError('');
  goTo('landing');
  toast('Signed out successfully.');
}

async function checkSavedSession() {
  const savedToken = localStorage.getItem('fc_auth_token');
  if (!savedToken) return;

  try {
    session.token = savedToken;
    const res = await api('/auth/me');
    if (res && res.user) {
      session = {
        token: savedToken,
        role: res.user.role,
        name: res.user.name,
        email: res.user.email,
        donorId: res.user.role === 'Donor' ? res.user.entityId : null,
        ngoId: res.user.role === 'NGO' ? res.user.entityId : null,
        volunteerId: res.user.role === 'Volunteer' ? res.user.entityId : null
      };

      document.getElementById('landing').classList.add('hidden');
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app-shell').classList.remove('hidden');

      document.getElementById('role-pill').textContent = session.role;
      document.getElementById('avatar-initial').textContent = session.name.charAt(0).toUpperCase();

      renderSidebar();
      await loadAllData();

      if (session.role === 'Donor') navigate('donor-dashboard');
      else if (session.role === 'NGO') navigate('ngo-dashboard');
      else if (session.role === 'Volunteer') navigate('vol-dashboard');
      else navigate('dashboard');
    }
  } catch (e) {
    localStorage.removeItem('fc_auth_token');
    localStorage.removeItem('fc_auth_user');
  }
}

/* =====================================================================
   SIDEBAR & VIEW NAVIGATION
===================================================================== */
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  donors: 'Donor Management',
  ngos: 'NGO Management',
  volunteers: 'Volunteer Management',
  donations: 'Food Donation Management',
  safety: 'Food Safety Check',
  matching: 'Donation Matching',
  assignment: 'Volunteer Assignment',
  tracking: 'Donation Tracking',
  reports: 'Reports',
  notifications: 'Notifications',
  'donor-dashboard': 'My Dashboard',
  'my-donations': 'My Donations',
  'ngo-dashboard': 'NGO Dashboard',
  'ngo-food': 'Available Food',
  'vol-dashboard': 'Volunteer Dashboard',
  'vol-tasks': 'My Deliveries'
};

const SIDEBAR_ITEMS = {
  Admin: [
    { group: 'Overview', items: [['dashboard', '▤', 'Dashboard'], ['notifications', '🔔', 'Notifications']] },
    { group: 'Directory', items: [['donors', '🏨', 'Donors'], ['ngos', '🤝', 'NGOs'], ['volunteers', '🚲', 'Volunteers']] },
    {
      group: 'Donation Flow',
      items: [
        ['donations', '🍱', 'Food Donations'],
        ['safety', '✅', 'Food Safety'],
        ['matching', '🔗', 'Donation Matching'],
        ['assignment', '🧑‍🤝‍🧑', 'Volunteer Assignment'],
        ['tracking', '📍', 'Donation Tracking']
      ]
    },
    { group: 'Insights', items: [['reports', '📊', 'Reports']] }
  ],
  Donor: [
    { group: 'My Account', items: [['donor-dashboard', '▤', 'My Dashboard'], ['my-donations', '🍱', 'My Donations'], ['notifications', '🔔', 'Notifications']] }
  ],
  NGO: [
    { group: 'My Account', items: [['ngo-dashboard', '▤', 'My Dashboard'], ['ngo-food', '🍱', 'Available Food'], ['notifications', '🔔', 'Notifications']] }
  ],
  Volunteer: [
    { group: 'My Account', items: [['vol-dashboard', '▤', 'My Dashboard'], ['vol-tasks', '🚲', 'My Deliveries'], ['notifications', '🔔', 'Notifications']] }
  ]
};

function renderSidebar() {
  const groups = SIDEBAR_ITEMS[session.role] || SIDEBAR_ITEMS.Admin;
  document.getElementById('sidebar-nav').innerHTML = groups.map(g => `
    <div class="nav-group-label">${g.group}</div>
    ${g.items.map(([page, icon, label]) => `
      <a class="nav-item ${currentPage === page ? 'active' : ''}" data-page="${page}" onclick="navigate('${page}')">
        <span class="ic">${icon}</span> ${label}
      </a>
    `).join('')}
  `).join('');
}

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || 'Dashboard';
  document.getElementById('page-content').innerHTML = renderPage(page);
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

function refresh() {
  const content = document.getElementById('page-content');
  if (content && !document.getElementById('app-shell').classList.contains('hidden')) {
    content.innerHTML = renderPage(currentPage);
  }
}

function renderPage(page) {
  switch (page) {
    case 'dashboard': return renderDashboard();
    case 'donor-dashboard': return renderDonorDashboard();
    case 'my-donations': return renderMyDonations();
    case 'donors': return renderDonors();
    case 'ngos': return renderNgos();
    case 'volunteers': return renderVolunteers();
    case 'donations': return renderDonations();
    case 'safety': return renderSafety();
    case 'matching': return renderMatching();
    case 'assignment': return renderAssignment();
    case 'tracking': return renderTracking();
    case 'reports': return renderReports();
    case 'notifications': return renderNotifications();
    case 'ngo-dashboard': return renderNgoDash();
    case 'ngo-food': return renderNgoFood();
    case 'vol-dashboard': return renderVolDash();
    case 'vol-tasks': return renderVolTasks();
    default: return session.role === 'Donor' ? renderDonorDashboard() : renderDashboard();
  }
}

function kpiCard(label, num) {
  const m = [
    ['Donors', '🏨'], ['NGOs', '🤝'], ['Volunteers', '🚲'],
    ['Delivered', '✅'], ['Available', '🟢'], ['Matched', '🔗'],
    ['In Progress', '⏳'], ['Donations', '🍱']
  ];
  const ic = (m.find(x => label.includes(x[0])) || [0, '📦'])[1];
  return `<div class="card kpi-card"><div class="kpi-ic">${ic}</div><div class="lbl">${label}</div><div class="num">${num}</div></div>`;
}

function emptyState(msg) {
  return `<div style="text-align:center;color:var(--text-faint);font-size:13.5px;padding:32px 12px;">${msg}</div>`;
}

function priorityItemHtml(p) {
  const info = expiryInfo(p.expiryHours);
  const donor = findDonor(p.donorId);
  return `<div class="priority-item">
    <div class="food-ic">${info.icon}</div>
    <div class="meta"><b>${p.foodName} &middot; ${p.quantity}</b><span>${donor ? donor.name : '—'} &middot; ${p.pickupLocation}</span></div>
    <span class="badge ${info.cls}">${p.expiryHours}h &middot; ${info.label.split(' — ')[0]}</span>
  </div>`;
}

function pipelineHtml() {
  const d = DB.donations;
  const n = f => d.filter(f).length;
  const st = [
    ['Donors', DB.donors.length],
    ['Donations', d.length],
    ['Safety Checked', n(x => x.timeline && x.timeline[1] && x.timeline[1].done)],
    ['Matched', n(x => x.timeline && x.timeline[2] && x.timeline[2].done)],
    ['Volunteer Assigned', n(x => x.timeline && x.timeline[3] && x.timeline[3].done)],
    ['Delivered', n(x => x.status === 'Delivered')]
  ];
  return `<div class="card pipeline">${st.map(s => `<span class="pipe-step">${s[0]}<b>${s[1]}</b></span>`).join('<span class="pipe-arrow">→</span>')}</div>`;
}

/* =====================================================================
   ADMIN DASHBOARD
===================================================================== */
function renderDashboard() {
  const d = DB.donations;
  const kpi = {
    donors: DB.donors.length,
    ngos: DB.ngos.length,
    volunteers: DB.volunteers.length,
    donations: d.length,
    available: d.filter(x => x.status === 'Available').length,
    matched: d.filter(x => x.status === 'Matched' || x.status === 'Volunteer Assigned' || x.status === 'Delivered').length
  };
  const priority = [...d].filter(x => x.status !== 'Expired' && x.status !== 'Delivered')
    .sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours)).slice(0, 5);

  return `
    <div class="page-head">
      <div>
        <h2>Welcome back, ${session.name}</h2>
        <p>Live MongoDB status &middot; ${dbHealthStatus.connected ? 'Connected to MongoDB Atlas' : 'In-Memory Resilient Store'}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="testDatabaseHealth()">🔌 Test Database</button>
        <button class="btn btn-primary btn-sm" onclick="navigate('donations')">Manage Donations</button>
      </div>
    </div>
    ${pipelineHtml()}
    <div class="kpi-grid">
      ${kpiCard('Total Donors', kpi.donors)}
      ${kpiCard('Total NGOs', kpi.ngos)}
      ${kpiCard('Total Volunteers', kpi.volunteers)}
      ${kpiCard('Total Donations', kpi.donations)}
      ${kpiCard('Available Donations', kpi.available)}
      ${kpiCard('Matched Donations', kpi.matched)}
    </div>
    <div class="grid-2">
      <div class="card panel">
        <div class="panel-title"><h4>Priority Donations</h4><span class="badge badge-red">Sorted by soonest expiry</span></div>
        <div class="priority-list">
          ${priority.length ? priority.map(p => priorityItemHtml(p)).join('') : emptyState('No active donations right now.')}
        </div>
      </div>
      <div class="card panel">
        <div class="panel-title"><h4>Recent Notifications</h4></div>
        ${DB.notifications.slice(0, 5).map(n => `
          <div class="notif-card"><span class="ic">${n.icon}</span><div><p>${n.text}</p><time>${timeAgo(n.time)}</time></div></div>
        `).join('') || emptyState('No notifications yet.')}
      </div>
    </div>`;
}

/* =====================================================================
   DONOR DASHBOARD & PORTAL
===================================================================== */
function renderDonorDashboard() {
  const donor = findDonor(session.donorId);
  if (!donor) return emptyState('Donor account profile not found.');
  const mine = DB.donations.filter(x => x.donorId === donor.id);
  const kpi = {
    total: mine.length,
    available: mine.filter(x => x.status === 'Available').length,
    inProgress: mine.filter(x => x.status === 'Matched' || x.status === 'Volunteer Assigned').length,
    delivered: mine.filter(x => x.status === 'Delivered').length
  };
  const priority = [...mine].filter(x => x.status !== 'Expired' && x.status !== 'Delivered')
    .sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours)).slice(0, 5);

  return `
    <div class="page-head">
      <div><h2>Welcome back, ${donor.name}</h2><p>${donor.type} account &middot; ${donor.phone}</p></div>
      <button class="btn btn-primary" onclick="openMyDonationModal()">+ Add Donation</button>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      ${kpiCard('Total Donations', kpi.total)}
      ${kpiCard('Available', kpi.available)}
      ${kpiCard('In Progress', kpi.inProgress)}
      ${kpiCard('Delivered', kpi.delivered)}
    </div>
    <div class="grid-2">
      <div class="card panel">
        <div class="panel-title"><h4>Your Priority Donations</h4><span class="badge badge-red">Sorted by soonest expiry</span></div>
        <div class="priority-list">
          ${priority.length ? priority.map(p => priorityItemHtml(p)).join('') : emptyState('No active donations right now.')}
        </div>
      </div>
      <div class="card panel">
        <div class="panel-title"><h4>Account Security</h4></div>
        <div class="safety-grid" style="grid-template-columns:1fr;">
          <div class="safety-stat"><div class="lbl">Donor ID</div><div class="val">${donor.id}</div></div>
          <div class="safety-stat"><div class="lbl">Login Email</div><div class="val">${donor.email || session.email || '—'}</div></div>
        </div>
        <button class="btn btn-ghost" style="margin-top:14px;width:100%;" onclick="openChangePasswordModal()">Change Password</button>
      </div>
    </div>`;
}

function openChangePasswordModal() {
  openModal(`
    <h3>Change Password</h3>
    <div class="field full"><label>Current Password</label><input id="cp-current" type="password" placeholder="••••••••"></div>
    <div class="field full"><label>New Password</label><input id="cp-new" type="password" placeholder="At least 4 characters"></div>
    <div class="field full"><label>Confirm New Password</label><input id="cp-confirm" type="password" placeholder="Re-type new password"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewPassword()">Update Password</button>
    </div>
  `);
}

async function saveNewPassword() {
  const currentPassword = document.getElementById('cp-current').value;
  const newPassword = document.getElementById('cp-new').value;
  const confirmPass = document.getElementById('cp-confirm').value;

  if (!currentPassword) { toast('Please enter your current password.'); return; }
  if (!newPassword || newPassword.length < 4) { toast('New password must be at least 4 characters.'); return; }
  if (newPassword !== confirmPass) { toast('New password and confirmation do not match.'); return; }

  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    toast('Password updated successfully in database.');
    closeModal();
  } catch (err) {
    toast(err.message || 'Failed to update password.');
  }
}

function renderMyDonations() {
  const donor = findDonor(session.donorId);
  if (!donor) return emptyState('Donor account not found.');
  const q = filters.donations.toLowerCase();
  let rows = DB.donations.filter(d => d.donorId === donor.id && (d.foodName.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)));
  rows = [...rows].sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));

  return `
    <div class="page-head">
      <div><h2>My Donations</h2><p>Donations you've listed as ${donor.name} (stored in MongoDB).</p></div>
      <button class="btn btn-primary" onclick="openMyDonationModal()">+ Add Donation</button>
    </div>
    <div class="card panel">
      <div class="toolbar">
        <input type="text" placeholder="Search your donations..." value="${filters.donations}" oninput="filters.donations=this.value;refresh()">
      </div>
      <table>
        <thead><tr><th>ID</th><th>Food</th><th>Qty</th><th>Expiry</th><th>Status</th><th>NGO</th><th>Volunteer</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(d => {
            const info = expiryInfo(d.expiryHours);
            const ngo = d.ngoId ? findNgo(d.ngoId) : null;
            const vol = d.volunteerId ? findVolunteer(d.volunteerId) : null;
            return `<tr>
              <td>${d.id}</td><td>${d.foodName}</td><td>${d.quantity}</td>
              <td><span class="badge ${info.cls}">${d.expiryHours}h</span></td>
              <td><span class="badge ${statusBadgeClass(d.status)}">${d.status}</span></td>
              <td>${ngo ? ngo.name : '—'}</td><td>${vol ? vol.name : '—'}</td>
              <td class="row-actions">
                ${d.status === 'Available' ? `<button class="btn btn-ghost btn-sm" onclick='openMyDonationModal("${d.id}")'>Edit</button>` : ''}
              </td>
            </tr>`;
          }).join('') : `<tr class="empty-row"><td colspan="8">You haven't listed any donations yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openMyDonationModal(id) {
  const donor = findDonor(session.donorId);
  const editing = id ? findDonation(id) : null;
  openModal(`
    <h3>${editing ? 'Edit Donation' : 'Add Donation'}</h3>
    <div class="form-grid">
      <div class="field full"><label>Donor</label><input value="${donor ? `${donor.id} — ${donor.name}` : session.name}" disabled></div>
      <div class="field full"><label>Food Name</label><input id="f-foodname" value="${editing ? editing.foodName : ''}" placeholder="e.g. Veg Rice Meals"></div>
      <div class="field"><label>Quantity</label><input id="f-qty" value="${editing ? editing.quantity : ''}" placeholder="e.g. 50 packets"></div>
      <div class="field"><label>Remaining Expiry (hours)</label><input id="f-expiry" type="number" step="0.5" value="${editing ? editing.expiryHours : ''}" placeholder="e.g. 3"></div>
      <div class="field"><label>Food Category</label>
        <select id="f-category">
          ${['Cooked Meal', 'Bakery', 'Fruits', 'Vegetables', 'Packaged Food', 'Dairy'].map(c => `<option ${editing && editing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Pickup Location</label><input id="f-pickup" value="${editing ? editing.pickupLocation : ''}" placeholder="e.g. Anna Nagar, Chennai"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveMyDonation(${editing ? `'${id}'` : 'null'})">${editing ? 'Save Changes' : 'Add Donation'}</button>
    </div>
  `);
}

async function saveMyDonation(id) {
  const foodName = document.getElementById('f-foodname').value.trim();
  const quantity = document.getElementById('f-qty').value.trim();
  const expiryHours = document.getElementById('f-expiry').value;
  const category = document.getElementById('f-category').value;
  const pickupLocation = document.getElementById('f-pickup').value.trim();

  if (!foodName || !quantity || expiryHours === '') {
    toast('Please fill in food name, quantity, and expiry hours.');
    return;
  }

  try {
    if (id) {
      await api(`/donations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ foodName, quantity, expiryHours: Number(expiryHours), category, pickupLocation })
      });
      toast('Donation updated in database.');
    } else {
      await api('/donations', {
        method: 'POST',
        body: JSON.stringify({
          donorId: session.donorId,
          foodName,
          quantity,
          expiryHours: Number(expiryHours),
          category,
          pickupLocation
        })
      });
      toast('Donation added to database and set as Available.');
    }
    closeModal();
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to save donation.');
  }
}

/* =====================================================================
   DONOR DIRECTORY (ADMIN)
===================================================================== */
function renderDonors() {
  const q = filters.donors.toLowerCase();
  const rows = DB.donors.filter(d => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
  return `
    <div class="page-head">
      <div><h2>Donor Management</h2><p>Hotels, restaurants, hostels and event organizers (stored in MongoDB).</p></div>
      <button class="btn btn-primary" onclick="openDonorModal()">+ Add Donor</button>
    </div>
    <div class="card panel">
      <div class="toolbar">
        <input type="text" placeholder="Search donors by name or ID..." value="${filters.donors}" oninput="filters.donors=this.value;refresh()">
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Type</th><th>Login Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(d => `
            <tr>
              <td>${d.id}</td><td>${d.name}</td><td>${d.phone}</td><td>${d.type}</td>
              <td>${d.email || `<span style="color:var(--text-faint);">not set</span>`}</td>
              <td><span class="badge ${d.status === 'Active' ? 'badge-green' : 'badge-grey'}">${d.status}</span></td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" onclick='viewEntity("donor","${d.id}")'>View</button>
                <button class="btn btn-ghost btn-sm" onclick='openDonorModal("${d.id}")'>Edit</button>
                <button class="btn btn-ghost btn-sm" onclick='toggleDonorStatus("${d.id}")'>${d.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                <button class="btn btn-danger btn-sm" onclick='deleteEntity("donors","${d.id}")'>Delete</button>
              </td>
            </tr>`).join('') : `<tr class="empty-row"><td colspan="7">No donors found.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openDonorModal(id) {
  const editing = id ? findDonor(id) : null;
  openModal(`
    <h3>${editing ? 'Edit Donor' : 'Add Donor'}</h3>
    <div class="form-grid">
      <div class="field full"><label>Donor ID</label><input id="f-donorid" value="${editing ? editing.id : 'D-' + (100 + DB.donors.length + 1)}" ${editing ? 'disabled' : ''}></div>
      <div class="field full"><label>Donor Name</label><input id="f-donorname" value="${editing ? editing.name : ''}" placeholder="e.g. Green Leaf Hotel"></div>
      <div class="field"><label>Phone Number</label><input id="f-donorphone" value="${editing ? editing.phone : ''}" placeholder="98xxxxxxxx"></div>
      <div class="field"><label>Donor Type</label>
        <select id="f-donortype">
          ${['Hotel', 'Restaurant', 'Hostel', 'Event Organizer'].map(t => `<option ${editing && editing.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field full" style="border-top:1px dashed var(--border);padding-top:14px;margin-top:2px;">
        <label>Login Email <span style="font-weight:400;color:var(--text-faint);">(used for Donor login)</span></label>
        <input id="f-donoremail" value="${editing ? (editing.email || '') : ''}" placeholder="e.g. greenleaf@foodconnect.org">
      </div>
      <div class="field full">
        <label>${editing ? 'Reset Password' : 'Login Password'} <span style="font-weight:400;color:var(--text-faint);">${editing ? '(leave blank to keep current)' : ''}</span></label>
        <input id="f-donorpass" type="text" placeholder="${editing ? '••••••••' : 'e.g. donor123'}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveDonor(${editing ? `'${id}'` : 'null'})">${editing ? 'Save Changes' : 'Add Donor'}</button>
    </div>
  `);
}

async function saveDonor(id) {
  const name = document.getElementById('f-donorname').value.trim();
  const phone = document.getElementById('f-donorphone').value.trim();
  const type = document.getElementById('f-donortype').value;
  const email = document.getElementById('f-donoremail').value.trim().toLowerCase();
  const pass = document.getElementById('f-donorpass').value;

  if (!name || !phone) { toast('Please fill in donor name and phone.'); return; }

  try {
    if (id) {
      await api(`/donors/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, phone, type, email, password: pass })
      });
      toast('Donor profile updated.');
    } else {
      const donorId = document.getElementById('f-donorid').value.trim();
      await api('/donors', {
        method: 'POST',
        body: JSON.stringify({ id: donorId, name, phone, type, email, password: pass })
      });
      toast('Donor added with account.');
    }
    closeModal();
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to save donor.');
  }
}

async function toggleDonorStatus(id) {
  try {
    const res = await api(`/donors/${id}/status`, { method: 'PATCH' });
    toast(res.status === 'Active' ? 'Donor activated.' : 'Donor deactivated.');
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to toggle status.');
  }
}

/* =====================================================================
   NGO DIRECTORY (ADMIN)
===================================================================== */
function renderNgos() {
  const q = filters.ngos.toLowerCase();
  const rows = DB.ngos.filter(n => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
  return `
    <div class="page-head">
      <div><h2>NGO Management</h2><p>Partner organizations that receive and distribute donated food.</p></div>
      <button class="btn btn-primary" onclick="openNgoModal()">+ Add NGO</button>
    </div>
    <div class="card panel">
      <div class="toolbar">
        <input type="text" placeholder="Search NGOs by name or ID..." value="${filters.ngos}" oninput="filters.ngos=this.value;refresh()">
      </div>
      <table>
        <thead><tr><th>ID</th><th>NGO Name</th><th>Location</th><th>Contact</th><th>Login Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(n => `
            <tr>
              <td>${n.id}</td><td>${n.name}</td><td>${n.location}</td><td>${n.contact}</td>
              <td>${n.email || `<span style="color:var(--text-faint);">not set</span>`}</td>
              <td><span class="badge ${n.status === 'Active' ? 'badge-green' : 'badge-grey'}">${n.status}</span></td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" onclick='openNgoModal("${n.id}")'>Edit</button>
                <button class="btn btn-danger btn-sm" onclick='deleteEntity("ngos","${n.id}")'>Delete</button>
              </td>
            </tr>`).join('') : `<tr class="empty-row"><td colspan="7">No NGOs found.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openNgoModal(id) {
  const editing = id ? findNgo(id) : null;
  openModal(`
    <h3>${editing ? 'Edit NGO' : 'Add NGO'}</h3>
    <div class="form-grid">
      <div class="field full"><label>NGO ID</label><input id="f-ngoid" value="${editing ? editing.id : 'N-' + (200 + DB.ngos.length + 1)}" ${editing ? 'disabled' : ''}></div>
      <div class="field full"><label>NGO Name</label><input id="f-ngoname" value="${editing ? editing.name : ''}" placeholder="e.g. Helping Hands NGO"></div>
      <div class="field"><label>Location</label><input id="f-ngoloc" value="${editing ? editing.location : ''}" placeholder="e.g. Chennai"></div>
      <div class="field"><label>Contact Number</label><input id="f-ngocontact" value="${editing ? editing.contact : ''}" placeholder="98xxxxxxxx"></div>
      <div class="field full" style="border-top:1px dashed var(--border);padding-top:14px;margin-top:2px;">
        <label>Login Email <span style="font-weight:400;color:var(--text-faint);">(used for NGO portal login)</span></label>
        <input id="f-ngoemail" value="${editing ? (editing.email || '') : ''}" placeholder="e.g. helpinghands@foodconnect.org">
      </div>
      <div class="field full">
        <label>${editing ? 'Reset Password' : 'Login Password'} <span style="font-weight:400;color:var(--text-faint);">${editing ? '(leave blank to keep current)' : ''}</span></label>
        <input id="f-ngopass" type="text" placeholder="${editing ? '••••••••' : 'e.g. ngo123'}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveNgo(${editing ? `'${id}'` : 'null'})">${editing ? 'Save Changes' : 'Add NGO'}</button>
    </div>
  `);
}

async function saveNgo(id) {
  const name = document.getElementById('f-ngoname').value.trim();
  const location = document.getElementById('f-ngoloc').value.trim();
  const contact = document.getElementById('f-ngocontact').value.trim();
  const email = document.getElementById('f-ngoemail').value.trim().toLowerCase();
  const pass = document.getElementById('f-ngopass').value;

  if (!name || !location) { toast('Please fill in NGO name and location.'); return; }

  try {
    if (id) {
      await api(`/ngos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, location, contact, email, password: pass })
      });
      toast('NGO profile updated.');
    } else {
      const ngoId = document.getElementById('f-ngoid').value.trim();
      await api('/ngos', {
        method: 'POST',
        body: JSON.stringify({ id: ngoId, name, location, contact, email, password: pass })
      });
      toast('NGO registered in database.');
    }
    closeModal();
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to save NGO.');
  }
}

/* =====================================================================
   VOLUNTEER DIRECTORY (ADMIN)
===================================================================== */
function renderVolunteers() {
  const q = filters.volunteers.toLowerCase();
  const rows = DB.volunteers.filter(v => v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q));
  return `
    <div class="page-head">
      <div><h2>Volunteer Management</h2><p>Volunteers who pick up and deliver matched donations.</p></div>
      <button class="btn btn-primary" onclick="openVolunteerModal()">+ Add Volunteer</button>
    </div>
    <div class="card panel">
      <div class="toolbar">
        <input type="text" placeholder="Search volunteers by name or ID..." value="${filters.volunteers}" oninput="filters.volunteers=this.value;refresh()">
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Availability</th><th>Login Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(v => `
            <tr>
              <td>${v.id}</td><td>${v.name}</td><td>${v.phone}</td><td>${v.availability}</td>
              <td>${v.email || `<span style="color:var(--text-faint);">not set</span>`}</td>
              <td><span class="badge ${v.status === 'Free' ? 'badge-green' : 'badge-amber'}">${v.status}</span></td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" onclick='openVolunteerModal("${v.id}")'>Edit</button>
                <button class="btn btn-danger btn-sm" onclick='deleteEntity("volunteers","${v.id}")'>Delete</button>
              </td>
            </tr>`).join('') : `<tr class="empty-row"><td colspan="7">No volunteers found.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openVolunteerModal(id) {
  const editing = id ? findVolunteer(id) : null;
  openModal(`
    <h3>${editing ? 'Edit Volunteer' : 'Add Volunteer'}</h3>
    <div class="form-grid">
      <div class="field full"><label>Volunteer ID</label><input id="f-volid" value="${editing ? editing.id : 'V-' + (300 + DB.volunteers.length + 1)}" ${editing ? 'disabled' : ''}></div>
      <div class="field full"><label>Name</label><input id="f-volname" value="${editing ? editing.name : ''}" placeholder="e.g. Arjun Kumar"></div>
      <div class="field"><label>Phone Number</label><input id="f-volphone" value="${editing ? editing.phone : ''}" placeholder="99xxxxxxxx"></div>
      <div class="field"><label>Availability</label>
        <select id="f-volavail">
          ${['Available', 'Weekdays only', 'Weekends only', 'Unavailable'].map(a => `<option ${editing && editing.availability === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </div>
      <div class="field full" style="border-top:1px dashed var(--border);padding-top:14px;margin-top:2px;">
        <label>Login Email <span style="font-weight:400;color:var(--text-faint);">(used for Volunteer login)</span></label>
        <input id="f-volemail" value="${editing ? (editing.email || '') : ''}" placeholder="e.g. arjun@foodconnect.org">
      </div>
      <div class="field full">
        <label>${editing ? 'Reset Password' : 'Login Password'} <span style="font-weight:400;color:var(--text-faint);">${editing ? '(leave blank to keep current)' : ''}</span></label>
        <input id="f-volpass" type="text" placeholder="${editing ? '••••••••' : 'e.g. vol123'}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveVolunteer(${editing ? `'${id}'` : 'null'})">${editing ? 'Save Changes' : 'Add Volunteer'}</button>
    </div>
  `);
}

async function saveVolunteer(id) {
  const name = document.getElementById('f-volname').value.trim();
  const phone = document.getElementById('f-volphone').value.trim();
  const availability = document.getElementById('f-volavail').value;
  const email = document.getElementById('f-volemail').value.trim().toLowerCase();
  const pass = document.getElementById('f-volpass').value;

  if (!name || !phone) { toast('Please fill in volunteer name and phone.'); return; }

  try {
    if (id) {
      await api(`/volunteers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, phone, availability, email, password: pass })
      });
      toast('Volunteer updated.');
    } else {
      const volId = document.getElementById('f-volid').value.trim();
      await api('/volunteers', {
        method: 'POST',
        body: JSON.stringify({ id: volId, name, phone, availability, email, password: pass })
      });
      toast('Volunteer added to database.');
    }
    closeModal();
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to save volunteer.');
  }
}

/* =====================================================================
   FOOD DONATION MANAGEMENT (ADMIN)
===================================================================== */
function renderDonations() {
  const q = filters.donations.toLowerCase();
  const statusFilter = filters.donationStatus;
  let rows = DB.donations.filter(d => d.foodName.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
  if (statusFilter === 'Urgent') {
    rows = rows.filter(d => expiryInfo(d.expiryHours).label.startsWith('URGENT') && d.status !== 'Expired');
  } else if (statusFilter !== 'All') {
    rows = rows.filter(d => d.status === statusFilter);
  }
  rows = [...rows].sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));

  const priority = [...DB.donations].filter(x => x.status !== 'Expired' && x.status !== 'Delivered')
    .sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours)).slice(0, 3);

  return `
    <div class="page-head">
      <div><h2>Food Donation Management</h2><p>Every donation is tracked from listing to delivery in MongoDB.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="fastForward()">⏩ Simulate +1 hour</button>
        <button class="btn btn-primary" onclick="openDonationModal()">+ Add Donation</button>
      </div>
    </div>

    <div class="card panel" style="margin-bottom:18px;background:var(--green-soft-2);border-color:var(--green-soft);">
      <div class="panel-title"><h4>🎯 Smart Expiry Priority</h4></div>
      <p style="font-size:13.5px;color:var(--text-muted);margin:0 0 14px;">Food nearing expiry is sorted first to prevent waste.</p>
      <div class="priority-list">
        ${priority.length ? priority.map(p => priorityItemHtml(p)).join('') : emptyState('Nothing urgent right now.')}
      </div>
    </div>

    <div class="card panel">
      <div class="toolbar">
        <input type="text" placeholder="Search donations by food or ID..." value="${filters.donations}" oninput="filters.donations=this.value;refresh()">
        <div class="chip-filters">
          ${['All', 'Available', 'Matched', 'Urgent', 'Expired', 'Delivered'].map(s => `
            <div class="chip ${statusFilter === s ? 'active' : ''}" onclick="filters.donationStatus='${s}';refresh()">${s}</div>
          `).join('')}
        </div>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Food</th><th>Qty</th><th>Donor</th><th>Expiry</th><th>Status</th><th>NGO</th><th>Volunteer</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(d => {
            const info = expiryInfo(d.expiryHours);
            const donor = findDonor(d.donorId);
            const ngo = d.ngoId ? findNgo(d.ngoId) : null;
            const vol = d.volunteerId ? findVolunteer(d.volunteerId) : null;
            return `<tr>
              <td>${d.id}</td><td>${d.foodName}</td><td>${d.quantity}</td><td>${donor ? donor.name : '—'}</td>
              <td><span class="badge ${info.cls}">${d.expiryHours}h</span></td>
              <td><span class="badge ${statusBadgeClass(d.status)}">${d.status}</span></td>
              <td>${ngo ? ngo.name : '—'}</td><td>${vol ? vol.name : '—'}</td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" onclick='openDonationModal("${d.id}")'>Edit</button>
                <button class="btn btn-danger btn-sm" onclick='deleteEntity("donations","${d.id}")'>Delete</button>
              </td>
            </tr>`;
          }).join('') : `<tr class="empty-row"><td colspan="9">No donations match this filter.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function openDonationModal(id) {
  const editing = id ? findDonation(id) : null;
  if (!DB.donors.length) { toast('Add a donor first.'); return; }
  openModal(`
    <h3>${editing ? 'Edit Donation' : 'Add Donation'}</h3>
    <div class="form-grid">
      <div class="field full"><label>Donation ID</label><input value="${editing ? editing.id : 'Auto-generated in MongoDB'}" disabled></div>
      <div class="field full"><label>Donor</label>
        <select id="f-dondorid">${DB.donors.map(d => `<option value="${d.id}" ${editing && editing.donorId === d.id ? 'selected' : ''}>${d.id} — ${d.name}</option>`).join('')}</select>
      </div>
      <div class="field full"><label>Food Name</label><input id="f-foodname" value="${editing ? editing.foodName : ''}" placeholder="e.g. Veg Rice Meals"></div>
      <div class="field"><label>Quantity</label><input id="f-qty" value="${editing ? editing.quantity : ''}" placeholder="e.g. 50 packets"></div>
      <div class="field"><label>Remaining Expiry (hours)</label><input id="f-expiry" type="number" step="0.5" value="${editing ? editing.expiryHours : ''}" placeholder="e.g. 3"></div>
      <div class="field"><label>Food Category</label>
        <select id="f-category">
          ${['Cooked Meal', 'Bakery', 'Fruits', 'Vegetables', 'Packaged Food', 'Dairy'].map(c => `<option ${editing && editing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Pickup Location</label><input id="f-pickup" value="${editing ? editing.pickupLocation : ''}" placeholder="e.g. Anna Nagar, Chennai"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveDonation(${editing ? `'${id}'` : 'null'})">${editing ? 'Save Changes' : 'Add Donation'}</button>
    </div>
  `);
}

async function saveDonation(id) {
  const donorId = document.getElementById('f-dondorid').value;
  const foodName = document.getElementById('f-foodname').value.trim();
  const quantity = document.getElementById('f-qty').value.trim();
  const expiryHours = document.getElementById('f-expiry').value;
  const category = document.getElementById('f-category').value;
  const pickupLocation = document.getElementById('f-pickup').value.trim();

  if (!foodName || !quantity || expiryHours === '') {
    toast('Please fill in food name, quantity, and expiry.');
    return;
  }

  try {
    if (id) {
      await api(`/donations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ donorId, foodName, quantity, expiryHours: Number(expiryHours), category, pickupLocation })
      });
      toast('Donation updated in database.');
    } else {
      await api('/donations', {
        method: 'POST',
        body: JSON.stringify({ donorId, foodName, quantity, expiryHours: Number(expiryHours), category, pickupLocation })
      });
      toast('Donation saved to MongoDB.');
    }
    closeModal();
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to save donation.');
  }
}

async function fastForward() {
  try {
    const res = await api('/donations/fast-forward', { method: 'POST' });
    toast(`Simulated 1 hour passing — ${res.updatedCount} donations updated.`);
    await loadAllData();
  } catch (err) {
    toast('Failed to fast forward time.');
  }
}

/* =====================================================================
   SAFETY CHECK, MATCHING & ASSIGNMENT
===================================================================== */
function renderSafety() {
  return `
    <div class="page-head"><div><h2>Food Safety Check</h2><p>Select a donation to verify whether it is safe to distribute.</p></div></div>
    <div class="card panel">
      <div class="field full" style="max-width:420px;">
        <label>Select Donation</label>
        <select id="safety-select" onchange="runSafetyCheck(this.value)">
          <option value="">-- choose a donation --</option>
          ${DB.donations.map(d => `<option value="${d.id}">${d.id} — ${d.foodName}</option>`).join('')}
        </select>
      </div>
      <div id="safety-output"></div>
    </div>`;
}

function runSafetyCheck(id) {
  const out = document.getElementById('safety-output');
  if (!id) { out.innerHTML = ''; return; }
  const d = findDonation(id);
  const info = expiryInfo(d.expiryHours);
  const donor = findDonor(d.donorId);
  out.innerHTML = `
    <div class="safety-result">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h4 style="font-size:16px;">${d.foodName}</h4>
        <span class="badge ${info.cls}">${info.icon} ${d.expiryHours <= 0 ? 'EXPIRED — Cannot be donated' : info.label}</span>
      </div>
      <p style="color:var(--text-muted);font-size:13.5px;margin:8px 0 0;">${info.desc}</p>
      <div class="safety-grid">
        <div class="safety-stat"><div class="lbl">Quantity</div><div class="val">${d.quantity}</div></div>
        <div class="safety-stat"><div class="lbl">Expiry Time</div><div class="val">${d.expiryHours} hours remaining</div></div>
        <div class="safety-stat"><div class="lbl">Donor</div><div class="val">${donor ? donor.name : '—'}</div></div>
        <div class="safety-stat"><div class="lbl">Pickup Location</div><div class="val">${d.pickupLocation}</div></div>
      </div>
    </div>`;
}

function renderMatching() {
  const available = DB.donations.filter(d => d.status === 'Available').sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));
  return `
    <div class="page-head"><div><h2>Donation Matching</h2><p>Match available donations with an NGO that can collect them.</p></div></div>
    <div class="card panel">
      <div class="field full" style="max-width:420px;">
        <label>Select an Available Donation</label>
        <select id="match-select" onchange="renderMatchDetail(this.value)">
          <option value="">-- choose a donation --</option>
          ${available.map(d => `<option value="${d.id}">${d.id} — ${d.foodName} (${d.expiryHours}h left)</option>`).join('')}
        </select>
      </div>
      <div id="match-output"></div>
    </div>`;
}

function renderMatchDetail(id) {
  const out = document.getElementById('match-output');
  if (!id) { out.innerHTML = ''; return; }
  const d = findDonation(id);
  const info = expiryInfo(d.expiryHours);
  out.innerHTML = `
    <div class="match-card">
      <b>Donation</b>
      <p style="margin:6px 0 0;font-size:14px;">${d.foodName} &middot; ${d.quantity}<br>
      <span style="color:var(--text-muted);font-size:13px;">Expiry: ${d.expiryHours}h &middot; ${d.pickupLocation}</span></p>
      <span class="badge ${info.cls}" style="margin-top:8px;display:inline-block;">${info.label}</span>
    </div>
    <div class="match-arrow">↓</div>
    <div>
      <b style="font-size:13.5px;">Available NGOs</b>
      <div style="margin-top:10px;">
        ${DB.ngos.map(n => `
          <div class="ngo-option">
            <div class="info"><b>${n.name}</b><span>${n.location} &middot; Contact: ${n.contact}</span></div>
            <button class="btn btn-primary btn-sm" onclick="matchDonation('${d.id}','${n.id}')">Match Donation</button>
          </div>`).join('')}
      </div>
    </div>`;
}

async function matchDonation(donationId, ngoId) {
  try {
    const res = await api(`/donations/${donationId}/match`, {
      method: 'POST',
      body: JSON.stringify({ ngoId })
    });
    const ngo = findNgo(ngoId);
    toast(`Donation ${donationId} matched with ${ngo ? ngo.name : 'NGO'}. Saved in MongoDB.`);
    await loadAllData();
    navigate('matching');
  } catch (err) {
    toast(err.message || 'Failed to match donation.');
  }
}

function renderAssignment() {
  const matched = DB.donations.filter(d => d.status === 'Matched');
  return `
    <div class="page-head"><div><h2>Volunteer Assignment</h2><p>Assign a volunteer to pick up and deliver a matched donation.</p></div></div>
    <div class="card panel">
      <div class="field full" style="max-width:420px;">
        <label>Select a Matched Donation</label>
        <select id="assign-select" onchange="renderAssignDetail(this.value)">
          <option value="">-- choose a donation --</option>
          ${matched.map(d => `<option value="${d.id}">${d.id} — ${d.foodName}</option>`).join('')}
        </select>
      </div>
      <div id="assign-output"></div>
    </div>`;
}

function renderAssignDetail(id) {
  const out = document.getElementById('assign-output');
  if (!id) { out.innerHTML = ''; return; }
  const d = findDonation(id);
  const ngo = findNgo(d.ngoId);
  out.innerHTML = `
    <div class="match-card">
      <div class="form-grid" style="grid-template-columns:1fr 1fr;">
        <div><b style="font-size:12px;color:var(--text-faint);">DONATION</b><p style="margin:4px 0 0;">${d.foodName}</p></div>
        <div><b style="font-size:12px;color:var(--text-faint);">NGO</b><p style="margin:4px 0 0;">${ngo ? ngo.name : '—'}</p></div>
      </div>
    </div>
    <div class="match-arrow">↓</div>
    <b style="font-size:13.5px;">Choose a Volunteer</b>
    <div style="margin-top:10px;">
      ${DB.volunteers.map(v => `
        <div class="ngo-option">
          <div class="info"><b>${v.name}</b><span>${v.availability} &middot; ${v.phone}</span></div>
          <button class="btn btn-primary btn-sm" onclick="assignVolunteer('${d.id}','${v.id}')">Assign Volunteer</button>
        </div>`).join('')}
    </div>`;
}

async function assignVolunteer(donationId, volId) {
  try {
    await api(`/donations/${donationId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ volunteerId: volId })
    });
    const vol = findVolunteer(volId);
    toast(`Volunteer ${vol ? vol.name : 'volunteer'} assigned. Saved in MongoDB.`);
    await loadAllData();
    navigate('assignment');
  } catch (err) {
    toast(err.message || 'Failed to assign volunteer.');
  }
}

function renderTracking() {
  return `
    <div class="page-head"><div><h2>Donation Tracking</h2><p>Follow a donation's status from creation through delivery.</p></div></div>
    <div class="card panel">
      <div class="field full" style="max-width:420px;">
        <label>Select Donation</label>
        <select id="track-select" onchange="renderTrackDetail(this.value)">
          <option value="">-- choose a donation --</option>
          ${DB.donations.map(d => `<option value="${d.id}">${d.id} — ${d.foodName}</option>`).join('')}
        </select>
      </div>
      <div id="track-output"></div>
    </div>`;
}

function renderTrackDetail(id) {
  const out = document.getElementById('track-output');
  if (!id) { out.innerHTML = ''; return; }
  const d = findDonation(id);
  out.innerHTML = `
    <div style="max-width:420px;margin-top:6px;">
      <div class="timeline">
        ${d.timeline.map((t, i) => `
          <div class="tl-step ${t.done ? 'done' : ''}">
            <div class="tl-line"></div>
            <div class="tl-dot">${t.done ? '✓' : (i + 1)}</div>
            <div class="tl-content"><b>${t.step}</b><span>${t.done ? 'Completed' : 'Pending'}</span></div>
          </div>`).join('')}
      </div>
      ${d.status !== 'Delivered' && d.status !== 'Expired' ? `
        <button class="btn btn-primary" style="margin-top:10px;" onclick="advanceStatus('${d.id}')">Advance to next step</button>
      ` : `<span class="badge ${statusBadgeClass(d.status)}" style="margin-top:10px;display:inline-block;">${d.status}</span>`}
    </div>`;
}

async function advanceStatus(id) {
  try {
    const res = await api(`/donations/${id}/advance`, { method: 'POST' });
    toast(`Advanced step: Status is now ${res.status}.`);
    await loadAllData();
    renderTrackDetail(id);
  } catch (err) {
    toast(err.message || 'Failed to advance step.');
  }
}

/* =====================================================================
   NGO PORTAL VIEWS
===================================================================== */
function renderNgoDash() {
  const me = findNgo(session.ngoId);
  if (!me) return emptyState('NGO account profile not found.');
  const mine = DB.donations.filter(d => d.ngoId === me.id);
  const del = mine.filter(d => d.status === 'Delivered');

  return `
    <div class="page-head">
      <div><h2>Welcome, ${me.name}</h2><p>${me.location} · ${me.contact}</p></div>
      <button class="btn btn-primary" onclick="navigate('ngo-food')">Browse available food</button>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      ${kpiCard('Donations Matched', mine.length)}
      ${kpiCard('In Progress', mine.filter(d => d.status !== 'Delivered' && d.status !== 'Expired').length)}
      ${kpiCard('Delivered', del.length)}
      ${kpiCard('Meals Received', del.reduce((a, d) => a + (parseInt(d.quantity) || 0), 0))}
    </div>
    <div class="card panel">
      <div class="panel-title"><h4>Your Donations</h4></div>
      <table>
        <thead><tr><th>ID</th><th>Food</th><th>Qty</th><th>Donor</th><th>Pickup Location</th><th>Volunteer</th><th>Status</th></tr></thead>
        <tbody>
          ${mine.length ? mine.map(d => {
            const donor = findDonor(d.donorId);
            const vol = findVolunteer(d.volunteerId);
            return `<tr>
              <td>${d.id}</td><td>${d.foodName}</td><td>${d.quantity}</td>
              <td>${donor ? donor.name : '—'}</td><td>${d.pickupLocation}</td>
              <td>${vol ? vol.name : '<i style="color:var(--text-faint)">awaiting</i>'}</td>
              <td><span class="badge ${statusBadgeClass(d.status)}">${d.status}</span></td>
            </tr>`;
          }).join('') : `<tr class="empty-row"><td colspan="7">Nothing claimed yet — browse Available Food.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function renderNgoFood() {
  const rows = DB.donations.filter(d => d.status === 'Available').sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));
  return `
    <div class="page-head"><div><h2>Available Food</h2><p>Claim donations for your NGO — shortest expiry first.</p></div></div>
    <div class="card panel">
      <table>
        <thead><tr><th>ID</th><th>Food</th><th>Qty</th><th>Donor</th><th>Pickup</th><th>Expiry</th><th>Priority</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(d => {
            const donor = findDonor(d.donorId);
            const info = expiryInfo(d.expiryHours);
            return `<tr>
              <td>${d.id}</td><td>${d.foodName}</td><td>${d.quantity}</td><td>${donor ? donor.name : '—'}</td>
              <td>${d.pickupLocation}</td>
              <td><span class="badge ${info.cls}">${d.expiryHours}h</span></td>
              <td><span class="badge ${info.cls}">${info.label.split(' — ')[0]}</span></td>
              <td><button class="btn btn-primary btn-sm" onclick="claimDonation('${d.id}')">Claim</button></td>
            </tr>`;
          }).join('') : `<tr class="empty-row"><td colspan="8">No available donations right now.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function claimDonation(id) {
  try {
    const res = await api(`/donations/${id}/claim`, { method: 'POST' });
    toast(`Claimed "${res.foodName}" successfully! Assigned to your NGO in MongoDB.`);
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to claim donation.');
  }
}

/* =====================================================================
   VOLUNTEER PORTAL VIEWS
===================================================================== */
function renderVolDash() {
  const me = findVolunteer(session.volunteerId);
  if (!me) return emptyState('Volunteer account profile not found.');
  const mine = DB.donations.filter(d => d.volunteerId === me.id);
  const active = mine.filter(d => d.status === 'Volunteer Assigned');
  const del = mine.filter(d => d.status === 'Delivered');

  return `
    <div class="page-head">
      <div><h2>Welcome, ${me.name}</h2><p>${me.phone} · ${me.availability} · <span class="badge ${me.status === 'Free' ? 'badge-green' : 'badge-amber'}">${me.status}</span></p></div>
      <button class="btn btn-primary" onclick="navigate('vol-tasks')">View my deliveries</button>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
      ${kpiCard('Active Deliveries', active.length)}
      ${kpiCard('Completed', del.length)}
      ${kpiCard('Meals Delivered', del.reduce((a, d) => a + (parseInt(d.quantity) || 0), 0))}
    </div>
    <div class="card panel">
      <div class="panel-title"><h4>Pickups waiting for you</h4></div>
      <div class="priority-list">
        ${active.length ? active.sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours)).map(priorityItemHtml).join('') : emptyState('No active pickups assigned right now.')}
      </div>
    </div>`;
}

function renderVolTasks() {
  const mine = DB.donations.filter(d => d.volunteerId === session.volunteerId).sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));
  return `
    <div class="page-head"><div><h2>My Deliveries</h2><p>Pick up from the donor, deliver to the NGO, then mark it delivered.</p></div></div>
    <div class="card panel">
      <table>
        <thead><tr><th>ID</th><th>Food</th><th>Qty</th><th>Pickup from</th><th>Deliver to</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${mine.length ? mine.map(d => {
            const ngo = findNgo(d.ngoId);
            const info = expiryInfo(d.expiryHours);
            return `<tr>
              <td>${d.id}</td><td>${d.foodName}</td><td>${d.quantity}</td><td>${d.pickupLocation}</td>
              <td>${ngo ? ngo.name : '—'}</td>
              <td><span class="badge ${info.cls}">${d.expiryHours}h</span></td>
              <td><span class="badge ${statusBadgeClass(d.status)}">${d.status}</span></td>
              <td>${d.status === 'Volunteer Assigned' ? `<button class="btn btn-primary btn-sm" onclick="markDelivered('${d.id}')">Mark Delivered</button>` : ''}</td>
            </tr>`;
          }).join('') : `<tr class="empty-row"><td colspan="8">No deliveries assigned yet.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function markDelivered(id) {
  try {
    await api(`/donations/${id}/deliver`, { method: 'POST' });
    toast('Delivery completed & saved to MongoDB — thank you!');
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to update delivery.');
  }
}

/* =====================================================================
   REPORTS & ANALYTICS
===================================================================== */
function renderReports() {
  const d = DB.donations;
  const byType = {};
  DB.donors.forEach(don => { byType[don.type] = 0; });
  d.forEach(x => {
    const don = findDonor(x.donorId);
    if (don) byType[don.type] = (byType[don.type] || 0) + 1;
  });

  const byStatus = { Available: 0, Matched: 0, 'Volunteer Assigned': 0, Delivered: 0, Expired: 0 };
  d.forEach(x => { byStatus[x.status] = (byStatus[x.status] || 0) + 1; });

  const byPriority = { 'Expired': 0, 'Urgent': 0, 'Donate Soon': 0, 'Safe to Donate': 0 };
  d.forEach(x => {
    if (Number(x.expiryHours) <= 0) byPriority['Expired']++;
    else if (Number(x.expiryHours) <= 2) byPriority['Urgent']++;
    else if (Number(x.expiryHours) <= 6) byPriority['Donate Soon']++;
    else byPriority['Safe to Donate']++;
  });

  return `
    <div class="page-head">
      <div><h2>Reports & Network Analytics</h2><p>Real-time analytics aggregated from MongoDB collections.</p></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="exportCSV()">⬇ Download CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Print</button>
      </div>
    </div>
    <div class="kpi-grid">
      ${kpiCard('Total Donors', DB.donors.length)}
      ${kpiCard('Total NGOs', DB.ngos.length)}
      ${kpiCard('Total Volunteers', DB.volunteers.length)}
      ${kpiCard('Total Donations', d.length)}
      ${kpiCard('Available', byStatus['Available'])}
      ${kpiCard('Delivered', byStatus['Delivered'])}
    </div>
    <div class="grid-2">
      <div class="card panel">
        <div class="panel-title"><h4>Donations by Donor Type</h4></div>
        ${barChart(byType)}
      </div>
      <div class="card panel">
        <div class="panel-title"><h4>Donation Status</h4></div>
        ${barChart(byStatus)}
      </div>
    </div>
    <div class="card panel" style="margin-top:18px;">
      <div class="panel-title"><h4>Food Expiry Priority Breakdown</h4></div>
      ${barChart(byPriority)}
    </div>`;
}

function barChart(obj) {
  const entries = Object.entries(obj);
  const max = Math.max(1, ...entries.map(e => e[1]));
  return `<div class="bars">${entries.map(([k, v]) => `
    <div class="bar-row">
      <span>${k}</span>
      <div class="track"><div class="fill" style="width:${(v / max * 100)}%;"></div></div>
      <span class="val">${v}</span>
    </div>`).join('')}</div>`;
}

function exportCSV() {
  window.open('/api/reports/csv', '_blank');
  toast('Downloading CSV report from database...');
}

/* =====================================================================
   NOTIFICATIONS
===================================================================== */
function renderNotifications() {
  return `
    <div class="page-head">
      <div><h2>Notifications</h2><p>Live alerts logged to MongoDB.</p></div>
      ${DB.notifications.length ? `<button class="btn btn-ghost btn-sm" onclick="clearNotifications()">Clear all</button>` : ''}
    </div>
    <div class="card panel">
      ${DB.notifications.length ? DB.notifications.map((n, i) => `
        <div class="notif-card">
          <span class="ic">${n.icon}</span>
          <div style="flex:1;"><p>${n.text}</p><time>${timeAgo(n.time || n.createdAt)}</time></div>
          <button class="btn btn-ghost btn-sm" onclick="deleteNotification('${n._id || i}')" title="Dismiss" style="padding:4px 9px;">✕</button>
        </div>
      `).join('') : emptyState('No notifications yet.')}
    </div>`;
}

async function deleteNotification(id) {
  try {
    await api(`/notifications/${id}`, { method: 'DELETE' });
    toast('Notification dismissed.');
    await loadAllData();
  } catch (err) {
    toast('Failed to delete notification.');
  }
}

async function clearNotifications() {
  if (!confirm('Clear all notifications from MongoDB?')) return;
  try {
    await api('/notifications', { method: 'DELETE' });
    toast('Notifications cleared.');
    await loadAllData();
  } catch (err) {
    toast('Failed to clear notifications.');
  }
}

/* =====================================================================
   DELETE ENTITY
===================================================================== */
async function deleteEntity(collection, id) {
  let warn = 'Delete this record? This cannot be undone.';
  if (collection === 'donors') {
    const n = DB.donations.filter(x => x.donorId === id).length;
    if (n) warn = `This donor has ${n} donation record(s). Deleting will remove their record from MongoDB. Continue?`;
  } else if (collection === 'ngos') {
    const n = DB.donations.filter(x => x.ngoId === id).length;
    if (n) warn = `This NGO is matched to ${n} donation(s). Continue?`;
  } else if (collection === 'volunteers') {
    const n = DB.donations.filter(x => x.volunteerId === id).length;
    if (n) warn = `This volunteer is assigned to ${n} donation(s). Continue?`;
  }

  if (!confirm(warn)) return;

  try {
    await api(`/${collection}/${id}`, { method: 'DELETE' });
    toast('Record deleted from database.');
    await loadAllData();
  } catch (err) {
    toast(err.message || 'Failed to delete record.');
  }
}

function viewEntity(type, id) {
  if (type === 'donor') {
    const d = findDonor(id);
    if (!d) return;
    const linked = DB.donations.filter(x => x.donorId === id);
    openModal(`
      <h3>${d.name}</h3>
      <p style="color:var(--text-muted);font-size:13.5px;">${d.type} &middot; ${d.phone}${d.email ? ` &middot; ${d.email}` : ''}</p>
      <div style="margin-top:14px;"><b style="font-size:13px;">Donations from this donor (${linked.length})</b>
        <div style="margin-top:8px;">
          ${linked.length ? linked.map(x => `<div class="ngo-option"><div class="info"><b>${x.foodName}</b><span>${x.quantity} &middot; ${x.status}</span></div></div>`).join('') : emptyState('No donations yet.')}
        </div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
    `);
  }
}

/* =====================================================================
   PUBLIC VIEW DONATIONS PREVIEW
===================================================================== */
function showDonationsPreview() {
  const list = DB.donations.filter(d => d.status !== 'Delivered' && d.status !== 'Expired').sort((a, b) => Number(a.expiryHours) - Number(b.expiryHours));
  openModal(`
    <h3>Live Food Donations</h3>
    <p style="color:var(--text-muted);font-size:13px;margin:-8px 0 14px;">Shortest expiry first &mdash; sign in to claim, match or deliver.</p>
    <div class="priority-list">${list.length ? list.map(priorityItemHtml).join('') : emptyState('No active donations right now.')}</div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();goTo('login-page')">Get Started / Sign In</button>
    </div>
  `);
}

/* =====================================================================
   DATABASE HEALTH TEST & RESET
===================================================================== */
async function testDatabaseHealth() {
  try {
    const res = await api('/health/test-db', { method: 'POST' });
    openModal(`
      <h3>MongoDB Status &amp; Diagnostics</h3>
      <p style="color:var(--text-muted);font-size:13.5px;margin:4px 0 16px;">Verified live connection and CRUD operations against the database.</p>
      <div class="safety-grid">
        <div class="safety-stat"><div class="lbl">Database Engine</div><div class="val">${res.databaseType}</div></div>
        <div class="safety-stat"><div class="lbl">Atlas Connected</div><div class="val">${res.connectedToAtlas ? 'Yes (Live Atlas)' : 'Fallback Store (Ready for MONGODB_URI)'}</div></div>
        <div class="safety-stat"><div class="lbl">Write Test</div><div class="val">${res.writeAcknowledged ? '✅ Passed' : '❌ Failed'}</div></div>
        <div class="safety-stat"><div class="lbl">Read Test</div><div class="val">${res.readVerified ? '✅ Passed' : '❌ Failed'}</div></div>
      </div>
      <p style="font-size:12.5px;color:var(--text-muted);margin:14px 0 0;">
        ${res.connectedToAtlas ? 'Data is permanently persisting to your MongoDB Atlas cluster.' : 'To connect MongoDB Atlas, set your <code>MONGODB_URI</code> in <code>.env</code> and restart.'}
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    `);
  } catch (err) {
    toast('Database diagnostic failed: ' + err.message);
  }
}

async function resetDemoData() {
  if (!confirm('Reset all collections back to the original demo dataset in MongoDB?')) return;
  try {
    await api('/health/reset-demo', { method: 'POST' });
    toast('MongoDB database reset to demo state.');
    await loadAllData();
  } catch (err) {
    toast('Failed to reset demo data: ' + err.message);
  }
}

/* =====================================================================
   INITIALIZATION
===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  await checkSavedSession();
});
