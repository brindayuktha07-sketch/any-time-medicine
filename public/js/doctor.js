const DoctorDash = {
  pending: [], // { consultation, patient }
  selectedRequestId: null,

  init() {
    document.getElementById('dd-profile-trigger').addEventListener('click', DoctorDash.openProfile);
    document.getElementById('dd-history-btn').addEventListener('click', DoctorDash.openHistory);
    document.getElementById('dd-online-toggle').addEventListener('change', DoctorDash.toggleOnline);
    document.getElementById('drm-accept').addEventListener('click', DoctorDash.acceptSelected);
  },

  async onLogin() {
    const u = App.state.user;
    document.getElementById('dd-name').textContent = u.name;
    App.renderAvatar('dd-avatar', u.photo, u.name);
    document.getElementById('dd-online-toggle').checked = true;
    await API.post(`/api/doctors/${u.id}/online`, { online: true });

    const hist = await API.get(`/api/doctors/${u.id}/history`);
    document.getElementById('dd-cases-sub').textContent = `${hist.totalCases} cases handled`;

    DoctorDash.loadMedicineStock();
    await DoctorDash.loadPending();

    const socket = App.state.socket;
    socket.off('consultation:new-request');
    socket.off('consultation:taken');
    socket.on('consultation:new-request', ({ consultation, patient }) => {
      DoctorDash.pending.push({ consultation, patient });
      DoctorDash.renderPending();
    });
    socket.on('consultation:taken', ({ consultationId }) => {
      DoctorDash.pending = DoctorDash.pending.filter((p) => p.consultation.id !== consultationId);
      DoctorDash.renderPending();
    });
  },

  async loadMedicineStock() {
    try {
      const r = await API.get('/api/medicines');
      const totalUnits = r.medicines.reduce((sum, m) => sum + m.quantity, 0);
      document.getElementById('dd-medicine-stock-badge').textContent =
        `${r.medicines.length} medicines \u00b7 ${totalUnits} units in ATM`;
    } catch (e) { /* non-critical, leave the placeholder text */ }
  },

  async toggleOnline(e) {
    await API.post(`/api/doctors/${App.state.user.id}/online`, { online: e.target.checked });
  },

  async loadPending() {
    const r = await API.get(`/api/consultations/pending/${App.state.user.id}`);
    DoctorDash.pending = r.pending;
    DoctorDash.renderPending();
  },

  renderPending() {
    const list = document.getElementById('dd-requests-list');
    const empty = document.getElementById('dd-requests-empty');
    list.innerHTML = '';
    if (DoctorDash.pending.length === 0) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    DoctorDash.pending.forEach(({ consultation, patient }) => {
      const card = document.createElement('div');
      card.className = 'card request-card';
      card.innerHTML = `
        <div class="info">
          <h4>${patient.name}</h4>
          <p>${consultation.symptoms}</p>
          <p style="font-size:11px;">${new Date(consultation.date).toLocaleString()}</p>
        </div>
        <button class="btn-outline">View &amp; Respond</button>`;
      card.querySelector('button').addEventListener('click', () => DoctorDash.openRequestDetail(consultation.id));
      list.appendChild(card);
    });
  },

  openRequestDetail(consultationId) {
    const entry = DoctorDash.pending.find((p) => p.consultation.id === consultationId);
    if (!entry) return;
    const { consultation, patient } = entry;
    DoctorDash.selectedRequestId = consultationId;

    document.getElementById('drm-patient-name').textContent = patient.name;
    document.getElementById('drm-symptoms').textContent = consultation.symptoms || '—';
    document.getElementById('drm-meds').textContent = consultation.medicinesTaken || '—';
    document.getElementById('drm-allergies').textContent = consultation.allergies || '—';

    const vitalsBox = document.getElementById('drm-vitals');
    vitalsBox.innerHTML = '';
    const vitals = consultation.vitals || {};
    const labels = { temp: 'Temperature', bp: 'Blood Pressure', pulse: 'Pulse', spo2: 'SpO2' };
    Object.keys(labels).forEach((k) => {
      vitalsBox.innerHTML += `<div class="vital-chip"><div class="v-label">${labels[k]}</div><div class="v-value">${vitals[k] || '--'}</div></div>`;
    });

    App.openModal('dd-request-modal');
  },

  async acceptSelected() {
    const id = DoctorDash.selectedRequestId;
    if (!id) return;
    try {
      const r = await API.post(`/api/consultations/${id}/accept`, { doctorId: App.state.user.id });
      App.closeModal('dd-request-modal');
      DoctorDash.pending = DoctorDash.pending.filter((p) => p.consultation.id !== id);
      DoctorDash.renderPending();
      App.state.activeConsultation = r.consultation;
      const entry = App.state.user;
      const patientName = (document.getElementById('drm-patient-name').textContent) || 'Patient';
      CallUI.start({ consultation: r.consultation, peerName: patientName, peerRole: 'Patient', isDoctor: true });
    } catch (e) {
      alert(e.message);
    }
  },

  async openHistory() {
    const r = await API.get(`/api/doctors/${App.state.user.id}/history`);
    document.getElementById('dd-history-count').textContent = `${r.totalCases} cases`;
    const body = document.getElementById('dd-history-body');
    body.innerHTML = '';
    r.history.forEach((c) => {
      const tr = document.createElement('tr');
      const bill = c.fee ? `\u20b9${Number(c.fee.total).toFixed(2)}` : '—';
      tr.innerHTML = `<td>${new Date(c.date).toLocaleString()}</td><td>${c.patientName}</td><td>${c.symptoms}</td><td>${bill}</td>`;
      body.appendChild(tr);
    });
    App.openModal('dd-history-modal');
  },

  openProfile() {
    const u = App.state.user;
    ProfileModal.open({
      title: 'Doctor Profile',
      apiBase: `/api/doctors/${u.id}`,
      otpPurpose: 'doctor-edit',
      viewHtml: `
        <p><strong>Name:</strong> ${u.name}</p>
        <p><strong>Medical ID:</strong> ${u.medicalId}</p>
        <p><strong>Phone:</strong> ${u.phone}</p>
        <p><strong>Email:</strong> ${u.email || '—'}</p>
        <p><strong>Experience:</strong> ${u.experience} yrs</p>
        <p><strong>Specialty:</strong> ${u.specialty || '—'}</p>`,
      editableFieldsHtml: `
        <label>Name</label><input data-field="name" value="${u.name}" />
        <label>Email</label><input data-field="email" value="${u.email || ''}" />
        <label>Experience (years)</label><input data-field="experience" type="number" value="${u.experience}" />
        <label>Specialty</label><input data-field="specialty" value="${u.specialty || ''}" />`,
      onSaved: (result) => {
        App.state.user = result.doctor;
        document.getElementById('dd-name').textContent = result.doctor.name;
        App.renderAvatar('dd-avatar', result.doctor.photo, result.doctor.name);
      },
    });
  },
};
