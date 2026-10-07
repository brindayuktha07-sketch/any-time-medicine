const AdminDash = {
  unlockedPassword: null,

  init() {
    document.getElementById('ad-profile-trigger').addEventListener('click', AdminDash.openProfile);
    document.getElementById('ad-load-atm-btn').addEventListener('click', () => App.openModal('ad-unlock-modal'));
    document.getElementById('ad-unlock-submit').addEventListener('click', AdminDash.unlockAtm);
    document.getElementById('al-med-submit').addEventListener('click', AdminDash.addMedicine);
  },

  onLogin() {
    const u = App.state.user;
    document.getElementById('ad-name').textContent = u.name;
    App.renderAvatar('ad-avatar', u.photo, u.name);
    AdminDash.loadMedicines();
    AdminDash.loadDoctors();
  },

  async loadDoctors() {
    try {
      const r = await API.get('/api/doctors');
      const body = document.getElementById('ad-doctors-body');
      body.innerHTML = '';
      r.doctors.forEach((d) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        const status = d.online ? '<span class="badge">Online</span>' : '<span class="badge warn">Offline</span>';
        tr.innerHTML = `<td>${d.name}</td><td>${d.specialty || '\u2014'}</td><td>${d.experience} yrs</td><td>${status}</td><td><span class="badge">${d.totalCases || 0} cases</span></td>`;
        tr.addEventListener('click', () => AdminDash.openDoctorHistory(d));
        body.appendChild(tr);
      });
    } catch (e) { /* non-critical */ }
  },

  async openDoctorHistory(doctor) {
    document.getElementById('adh-doctor-name').textContent = doctor.name;
    const body = document.getElementById('adh-history-body');
    const empty = document.getElementById('adh-history-empty');
    body.innerHTML = '';
    App.openModal('ad-doctor-history-modal');
    try {
      const r = await API.get(`/api/doctors/${doctor.id}/history`);
      document.getElementById('adh-case-count').textContent = `${r.totalCases} cases`;
      if (r.history.length === 0) { empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');
      r.history.forEach((c) => {
        const tr = document.createElement('tr');
        const bill = c.fee ? `\u20b9${Number(c.fee.total).toFixed(2)}` : '\u2014';
        tr.innerHTML = `<td>${new Date(c.date).toLocaleString()}</td><td>${c.patientName}</td><td>${c.symptoms}</td><td>${bill}</td>`;
        body.appendChild(tr);
      });
    } catch (e) {
      empty.textContent = 'Could not load this doctor\'s history.';
      empty.classList.remove('hidden');
    }
  },

  async loadMedicines() {
    const r = await API.get('/api/admins/data/medicines');
    const body = document.getElementById('ad-medicine-body');
    body.innerHTML = '';
    const now = new Date();
    r.medicines.forEach((m) => {
      const expiry = new Date(m.expiryDate);
      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      let status = `<span class="badge">Good</span>`;
      if (daysLeft < 0) status = `<span class="badge danger">Expired</span>`;
      else if (daysLeft < 30) status = `<span class="badge warn">Expiring soon</span>`;
      if (m.quantity <= 5) status += ` <span class="badge warn">Low stock</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.name}</td><td>\u20b9${Number(m.price).toFixed(2)}</td><td>${m.quantity}</td><td>${m.expiryDate}</td><td>${status}</td>`;
      body.appendChild(tr);
    });
  },

  async unlockAtm() {
    const password = document.getElementById('ad-unlock-password').value;
    const err = document.getElementById('ad-unlock-error');
    err.textContent = '';
    try {
      await API.post('/api/admins/data/medicines/unlock', { password });
      AdminDash.unlockedPassword = password;
      App.closeModal('ad-unlock-modal');
      document.getElementById('al-med-name').value = '';
      document.getElementById('al-med-price').value = '';
      document.getElementById('al-med-qty').value = '';
      document.getElementById('al-med-expiry').value = '';
      document.getElementById('al-med-error').textContent = '';
      document.getElementById('al-med-success').textContent = '';
      App.openModal('ad-load-modal');
    } catch (e) { err.textContent = e.message; }
  },

  async addMedicine() {
    const err = document.getElementById('al-med-error');
    err.textContent = '';
    try {
      await API.post('/api/admins/data/medicines', {
        password: AdminDash.unlockedPassword,
        name: document.getElementById('al-med-name').value.trim(),
        price: document.getElementById('al-med-price').value,
        quantity: document.getElementById('al-med-qty').value,
        expiryDate: document.getElementById('al-med-expiry').value,
      });
      document.getElementById('al-med-success').textContent = 'Medicine loaded into the ATM.';
      AdminDash.loadMedicines();
    } catch (e) { err.textContent = e.message; }
  },

  openProfile() {
    const u = App.state.user;
    ProfileModal.open({
      title: 'Admin Profile',
      apiBase: `/api/admins/${u.id}`,
      otpPurpose: 'admin-edit',
      viewHtml: `<p><strong>Name:</strong> ${u.name}</p><p><strong>Phone:</strong> ${u.phone}</p>`,
      editableFieldsHtml: `<label>Name</label><input data-field="name" value="${u.name}" />`,
      onSaved: (result) => {
        App.state.user = result.admin;
        document.getElementById('ad-name').textContent = result.admin.name;
        App.renderAvatar('ad-avatar', result.admin.photo, result.admin.name);
      },
    });
  },
};
