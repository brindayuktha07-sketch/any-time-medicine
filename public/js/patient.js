const PatientDash = {
  vitals: {},

  init() {
    document.getElementById('pd-profile-trigger').addEventListener('click', PatientDash.openProfile);
    document.getElementById('pd-new-consult-btn').addEventListener('click', PatientDash.openNewConsult);

    document.querySelectorAll('[data-vital]').forEach((btn) => {
      btn.addEventListener('click', () => PatientDash.fetchVital(btn.dataset.vital));
    });

    document.getElementById('nc-submit').addEventListener('click', PatientDash.submitConsultation);
    document.getElementById('pc-dispense-btn').addEventListener('click', PatientDash.dispense);
  },

  onLogin() {
    const u = App.state.user;
    document.getElementById('pd-name').textContent = u.name;
    App.renderAvatar('pd-avatar', u.photo, u.name);
    PatientDash.loadHistory();

    const socket = App.state.socket;
    socket.off('consultation:accepted');
    socket.on('consultation:accepted', ({ consultation, doctor }) => {
      App.closeModal('pd-waiting-modal');
      App.state.activeConsultation = consultation;
      CallUI.start({ consultation, peerName: doctor.name, peerRole: 'Doctor', isDoctor: false });
    });
  },

  async loadHistory() {
    const r = await API.get(`/api/patients/${App.state.user.id}/history`);
    const body = document.getElementById('pd-history-body');
    const empty = document.getElementById('pd-history-empty');
    body.innerHTML = '';
    if (r.history.length === 0) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    r.history.forEach((h) => {
      const tr = document.createElement('tr');
      const meds = h.medicines.map((m) => `${m.name}${m.dosage ? ' (' + m.dosage + ')' : ''}`).join(', ') || '—';
      const total = h.fee ? `\u20b9${Number(h.fee.total).toFixed(2)}` : '—';
      tr.innerHTML = `
        <td>${new Date(h.date).toLocaleString()}</td>
        <td>${h.doctorName}</td>
        <td><span class="badge">${h.doctorCaseCount} cases handled</span></td>
        <td>${meds} ${h.dispensed ? '<span class="badge">Dispensed</span>' : ''}</td>
        <td>${total}</td>`;
      body.appendChild(tr);
    });
  },

  openProfile() {
    const u = App.state.user;
    ProfileModal.open({
      title: 'Patient Profile',
      apiBase: `/api/patients/${u.id}`,
      otpPurpose: 'patient-edit',
      viewHtml: `
        <p><strong>Name:</strong> ${u.name}</p>
        <p><strong>Phone:</strong> ${u.phone}</p>
        <p><strong>Email:</strong> ${u.email || '—'}</p>`,
      editableFieldsHtml: `
        <label>Name</label><input data-field="name" value="${u.name}" />
        <label>Email</label><input data-field="email" value="${u.email || ''}" />`,
      onSaved: (result) => {
        App.state.user = result.patient;
        document.getElementById('pd-name').textContent = result.patient.name;
        App.renderAvatar('pd-avatar', result.patient.photo, result.patient.name);
      },
    });
  },

  openNewConsult() {
    document.getElementById('nc-symptoms').value = '';
    document.getElementById('nc-meds').value = '';
    document.getElementById('nc-allergies').value = '';
    document.getElementById('nc-error').textContent = '';
    document.getElementById('nc-success').textContent = '';
    PatientDash.vitals = {};
    ['temp', 'bp', 'pulse', 'spo2'].forEach((k) => (document.getElementById(`v-${k}`).textContent = '--'));
    App.openModal('pd-new-consult-modal');
  },

  // Simulates pulling a reading from the connected vitals machine (no manual entry).
  fetchVital(kind) {
    const generators = {
      temp: () => (97.5 + Math.random() * 2.5).toFixed(1) + '°F',
      bp: () => `${Math.floor(108 + Math.random() * 20)}/${Math.floor(70 + Math.random() * 12)}`,
      pulse: () => `${Math.floor(64 + Math.random() * 30)} bpm`,
      spo2: () => `${Math.floor(95 + Math.random() * 4)}%`,
    };
    const value = generators[kind]();
    PatientDash.vitals[kind] = value;
    document.getElementById(`v-${kind}`).textContent = value;
  },

  async submitConsultation() {
    const err = document.getElementById('nc-error');
    const symptoms = document.getElementById('nc-symptoms').value.trim();
    err.textContent = '';
    if (!symptoms) { err.textContent = 'Please describe your symptoms.'; return; }

    try {
      await API.post('/api/consultations', {
        patientId: App.state.user.id,
        symptoms,
        medicinesTaken: document.getElementById('nc-meds').value.trim(),
        allergies: document.getElementById('nc-allergies').value.trim(),
        vitals: PatientDash.vitals,
      });
      App.closeModal('pd-new-consult-modal');
      App.openModal('pd-waiting-modal');
    } catch (e) { err.textContent = e.message; }
  },

  async dispense() {
    const c = App.state.activeConsultation;
    if (!c) return;
    try {
      await API.post(`/api/consultations/${c.id}/dispense`, {});
      document.getElementById('pc-dispense-success').textContent = 'Medicines dispensed from the ATM!';
      document.getElementById('pc-dispense-btn').disabled = true;
      PatientDash.loadHistory();
    } catch (e) {
      document.getElementById('pc-dispense-success').textContent = '';
      alert(e.message);
    }
  },
};
