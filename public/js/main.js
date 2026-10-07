const App = {
  state: {
    role: null, // 'patient' | 'doctor' | 'admin'
    user: null, // the logged-in user object (as returned by the API, minus password)
    socket: null,
    activeConsultation: null, // used while a call is in progress / just ended
  },

  ALL_VIEWS: [
    'splash-view', 'role-select-view',
    'patient-auth-view', 'doctor-auth-view', 'admin-auth-view',
    'patient-dashboard-view', 'doctor-dashboard-view', 'admin-dashboard-view',
    'call-view',
  ],

  showView(id) {
    App.ALL_VIEWS.forEach((v) => document.getElementById(v).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  },

  openModal(id) { document.getElementById(id).classList.remove('hidden'); },
  closeModal(id) { document.getElementById(id).classList.add('hidden'); },

  avatarInitial(name) { return (name || '?').trim().charAt(0).toUpperCase(); },

  renderAvatar(imgElId, photoUrl, name) {
    const el = document.getElementById(imgElId);
    if (photoUrl) {
      el.innerHTML = '';
      el.style.backgroundImage = `url(${photoUrl})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = App.avatarInitial(name);
    }
  },

  ensureSocket() {
    if (!App.state.socket) App.state.socket = io();
    return App.state.socket;
  },

  identify() {
    if (!App.state.socket || !App.state.user) return;
    App.state.socket.emit('identify', { role: App.state.role, id: App.state.user.id });
  },

  loginSuccess(role, user) {
    App.state.role = role;
    App.state.user = user;
    App.ensureSocket();
    App.identify();

    if (role === 'patient') {
      App.showView('patient-dashboard-view');
      PatientDash.onLogin();
    } else if (role === 'doctor') {
      App.showView('doctor-dashboard-view');
      DoctorDash.onLogin();
    } else if (role === 'admin') {
      App.showView('admin-dashboard-view');
      AdminDash.onLogin();
    }
  },

  logout() {
    if (App.state.socket) App.state.socket.disconnect();
    App.state.socket = null;
    App.state.role = null;
    App.state.user = null;
    App.showView('role-select-view');
  },
};

/* -------------------- Shared "Profile" modal (all 3 roles) -------------------- */

const ProfileModal = {
  fields: [], // editable field definitions for the currently open role
  otpPurpose: '',
  apiBase: '',

  open({ title, viewHtml, editableFieldsHtml, otpPurpose, apiBase, onSaved }) {
    document.querySelector('#profile-modal .form-title').textContent = title;
    document.getElementById('profile-view-fields').innerHTML = viewHtml;
    document.getElementById('profile-editable-fields').innerHTML = editableFieldsHtml;
    document.getElementById('profile-edit-fields').classList.add('hidden');
    document.getElementById('profile-edit-request').classList.remove('hidden');
    document.getElementById('profile-error').textContent = '';
    document.getElementById('profile-success').textContent = '';
    ProfileModal.otpPurpose = otpPurpose;
    ProfileModal.apiBase = apiBase;
    ProfileModal.onSaved = onSaved;
    App.openModal('profile-modal');
  },
};

document.getElementById('profile-edit-btn').addEventListener('click', async () => {
  try {
    const r = await API.post(`${ProfileModal.apiBase}/request-edit-otp`, {});
    document.getElementById('profile-edit-fields').classList.remove('hidden');
    document.getElementById('profile-edit-request').classList.add('hidden');
    document.getElementById('profile-success').textContent = r.message || 'OTP sent.';
  } catch (e) {
    document.getElementById('profile-error').textContent = e.message;
  }
});

document.getElementById('profile-resend-otp').addEventListener('click', async () => {
  try {
    const r = await API.post(`${ProfileModal.apiBase}/request-edit-otp`, {});
    document.getElementById('profile-success').textContent = r.message ? `OTP resent. ${r.message}` : 'OTP resent.';
  } catch (e) {
    document.getElementById('profile-error').textContent = e.message;
  }
});

document.getElementById('profile-save-btn').addEventListener('click', async () => {
  const otpCode = document.getElementById('profile-otp').value.trim();
  document.getElementById('profile-error').textContent = '';
  if (!otpCode) { document.getElementById('profile-error').textContent = 'Enter the OTP first.'; return; }

  const payload = { otpCode };
  document.querySelectorAll('#profile-editable-fields [data-field]').forEach((el) => {
    payload[el.dataset.field] = el.value;
  });

  try {
    const result = await API.put(ProfileModal.apiBase, payload);
    document.getElementById('profile-success').textContent = 'Profile updated successfully.';
    if (ProfileModal.onSaved) ProfileModal.onSaved(result);
  } catch (e) {
    document.getElementById('profile-error').textContent = e.message;
  }
});

/* -------------------- Generic UI wiring -------------------- */

document.addEventListener('click', (e) => {
  const closeId = e.target.getAttribute('data-close');
  if (closeId) App.closeModal(closeId);

  const backTarget = e.target.getAttribute('data-back');
  if (backTarget === 'role-select') {
    e.preventDefault();
    App.showView('role-select-view');
  }
});

document.querySelectorAll('.role-card').forEach((card) => {
  card.addEventListener('click', () => {
    const role = card.dataset.role;
    App.showView(`${role}-auth-view`);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  PatientDash.init();
  DoctorDash.init();
  AdminDash.init();
  CallUI.init();

  runSplashSequence(() => App.showView('role-select-view'));
});
