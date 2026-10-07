const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Auth = {
  patientCam: null,
  doctorCam: null,
  adminCam: null,

  init() {
    Auth.wireFormToggles();
    Auth.wireCameras();
    Auth.wirePatient();
    Auth.wireDoctor();
    Auth.wireAdmin();
  },

  wireFormToggles() {
    document.querySelectorAll('.form-toggle').forEach((toggle) => {
      const buttons = toggle.querySelectorAll('button');
      const formCard = toggle.closest('.form-card');
      const authView = toggle.closest('.centered-view');
      const prefix = authView.id.split('-')[0]; // patient/doctor/admin
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          formCard.querySelectorAll(':scope > div[id$="-form"]').forEach((f) => f.classList.add('hidden'));
          const target = document.getElementById(`${prefix}-${btn.dataset.mode}-form`);
          if (target) target.classList.remove('hidden');
        });
      });
    });

    document.getElementById('pl-forgot').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('patient-login-form').classList.add('hidden');
      document.getElementById('patient-signup-form').classList.add('hidden');
      document.getElementById('patient-forgot-form').classList.remove('hidden');
    });

    document.getElementById('pf-back-to-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('patient-forgot-form').classList.add('hidden');
      document.getElementById('patient-login-form').classList.remove('hidden');
    });
  },

  wireCameras() {
    Auth.patientCam = setupCameraCapture({
      videoEl: document.getElementById('ps-video'), previewEl: document.getElementById('ps-photo-preview'),
      startBtn: document.getElementById('ps-start-cam'), captureBtn: document.getElementById('ps-capture'), retakeBtn: document.getElementById('ps-retake'),
    });
    Auth.doctorCam = setupCameraCapture({
      videoEl: document.getElementById('ds-video'), previewEl: document.getElementById('ds-photo-preview'),
      startBtn: document.getElementById('ds-start-cam'), captureBtn: document.getElementById('ds-capture'), retakeBtn: document.getElementById('ds-retake'),
    });
    Auth.adminCam = setupCameraCapture({
      videoEl: document.getElementById('as-video'), previewEl: document.getElementById('as-photo-preview'),
      startBtn: document.getElementById('as-start-cam'), captureBtn: document.getElementById('as-capture'), retakeBtn: document.getElementById('as-retake'),
    });
  },

  /* ------------------------------- Patient -------------------------------- */
  wirePatient() {
    document.getElementById('ps-send-otp').addEventListener('click', async () => {
      const phone = document.getElementById('ps-phone').value.trim();
      const email = document.getElementById('ps-email').value.trim();
      const err = document.getElementById('ps-error');
      err.textContent = '';
      if (!phone) { err.textContent = 'Enter a phone number first.'; return; }
      if (!EMAIL_PATTERN.test(email)) { err.textContent = 'Enter a valid email address — your OTP is sent there.'; return; }
      try {
        const r = await API.post('/api/auth/otp/send', { phone, email, purpose: 'patient-signup' });
        document.getElementById('ps-success').textContent = r.message;
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('ps-submit').addEventListener('click', async () => {
      const err = document.getElementById('ps-error');
      err.textContent = '';
      const payload = {
        name: document.getElementById('ps-name').value.trim(),
        phone: document.getElementById('ps-phone').value.trim(),
        aadhar: document.getElementById('ps-aadhar').value.trim(),
        email: document.getElementById('ps-email').value.trim(),
        password: document.getElementById('ps-password').value,
        confirmPassword: document.getElementById('ps-confirm').value,
        photo: Auth.patientCam.getPhoto(),
        otpCode: document.getElementById('ps-otp').value.trim(),
      };
      if (!EMAIL_PATTERN.test(payload.email)) { err.textContent = 'A valid email address is required.'; return; }
      if (!payload.photo) { err.textContent = 'Please capture your photo first.'; return; }
      try {
        const r = await API.post('/api/auth/patient/signup', payload);
        App.loginSuccess('patient', r.patient);
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('pl-submit').addEventListener('click', async () => {
      const err = document.getElementById('pl-error');
      err.textContent = '';
      try {
        const r = await API.post('/api/auth/patient/login', {
          phone: document.getElementById('pl-phone').value.trim(),
          password: document.getElementById('pl-password').value,
        });
        App.loginSuccess('patient', r.patient);
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('pf-send-otp').addEventListener('click', async () => {
      const phone = document.getElementById('pf-phone').value.trim();
      document.getElementById('pf-error').textContent = '';
      try {
        const r = await API.post('/api/auth/otp/send', { phone, purpose: 'patient-forgot' });
        document.getElementById('pf-success').textContent = r.message;
      } catch (e) { document.getElementById('pf-error').textContent = e.message; }
    });

    document.getElementById('pf-submit').addEventListener('click', async () => {
      const err = document.getElementById('pf-error');
      err.textContent = '';
      try {
        await API.post('/api/auth/patient/forgot-password', {
          phone: document.getElementById('pf-phone').value.trim(),
          otpCode: document.getElementById('pf-otp').value.trim(),
          newPassword: document.getElementById('pf-new-password').value,
        });
        document.getElementById('pf-success').textContent = 'Password reset! You can now log in.';
      } catch (e) { err.textContent = e.message; }
    });
  },

  /* -------------------------------- Doctor --------------------------------- */
  wireDoctor() {
    document.getElementById('ds-send-otp').addEventListener('click', async () => {
      const phone = document.getElementById('ds-phone').value.trim();
      const email = document.getElementById('ds-email').value.trim();
      const err = document.getElementById('ds-error');
      err.textContent = '';
      if (!phone) { err.textContent = 'Enter a phone number first.'; return; }
      if (!EMAIL_PATTERN.test(email)) { err.textContent = 'Enter a valid email address — your OTP is sent there.'; return; }
      try {
        const r = await API.post('/api/auth/otp/send', { phone, email, purpose: 'doctor-signup' });
        document.getElementById('ds-success').textContent = r.message;
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('ds-submit').addEventListener('click', async () => {
      const err = document.getElementById('ds-error');
      err.textContent = '';
      const photo = Auth.doctorCam.getPhoto();
      const certFile = document.getElementById('ds-cert').files[0];
      if (!EMAIL_PATTERN.test(document.getElementById('ds-email').value.trim())) { err.textContent = 'A valid email address is required.'; return; }
      if (!photo) { err.textContent = 'Please capture your photo first.'; return; }
      if (!certFile) { err.textContent = 'Please upload your medical certificate.'; return; }

      const fd = new FormData();
      fd.append('name', document.getElementById('ds-name').value.trim());
      fd.append('medicalId', document.getElementById('ds-medid').value.trim());
      fd.append('phone', document.getElementById('ds-phone').value.trim());
      fd.append('email', document.getElementById('ds-email').value.trim());
      fd.append('experience', document.getElementById('ds-exp').value.trim());
      fd.append('specialty', document.getElementById('ds-specialty').value.trim());
      fd.append('password', document.getElementById('ds-password').value);
      fd.append('confirmPassword', document.getElementById('ds-confirm').value);
      fd.append('photo', photo);
      fd.append('otpCode', document.getElementById('ds-otp').value.trim());
      fd.append('certificate', certFile);

      try {
        const r = await API.postForm('/api/auth/doctor/signup', fd);
        App.loginSuccess('doctor', r.doctor);
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('dl-send-otp').addEventListener('click', async () => {
      const phone = document.getElementById('dl-phone').value.trim();
      const err = document.getElementById('dl-error');
      err.textContent = '';
      if (!phone) { err.textContent = 'Enter a phone number first.'; return; }
      try {
        const r = await API.post('/api/auth/otp/send', { phone, purpose: 'doctor-login' });
        err.textContent = '';
        document.getElementById('dl-error').style.color = 'var(--accent)';
        document.getElementById('dl-error').textContent = r.message;
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('dl-submit').addEventListener('click', async () => {
      const err = document.getElementById('dl-error');
      err.style.color = '';
      err.textContent = '';
      try {
        const r = await API.post('/api/auth/doctor/login', {
          phone: document.getElementById('dl-phone').value.trim(),
          otpCode: document.getElementById('dl-otp').value.trim(),
        });
        App.loginSuccess('doctor', r.doctor);
      } catch (e) { err.textContent = e.message; }
    });
  },

  /* -------------------------------- Admin ---------------------------------- */
  wireAdmin() {
    document.getElementById('as-send-otp').addEventListener('click', async () => {
      const phone = document.getElementById('as-phone').value.trim();
      const email = document.getElementById('as-email').value.trim();
      const err = document.getElementById('as-error');
      err.textContent = '';
      if (!phone) { err.textContent = 'Enter a phone number first.'; return; }
      if (!EMAIL_PATTERN.test(email)) { err.textContent = 'Enter a valid email address — your OTP is sent there.'; return; }
      try {
        const r = await API.post('/api/auth/otp/send', { phone, email, purpose: 'admin-signup' });
        document.getElementById('as-success').textContent = r.message;
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('as-submit').addEventListener('click', async () => {
      const err = document.getElementById('as-error');
      err.textContent = '';
      const payload = {
        name: document.getElementById('as-name').value.trim(),
        phone: document.getElementById('as-phone').value.trim(),
        email: document.getElementById('as-email').value.trim(),
        password: document.getElementById('as-password').value,
        confirmPassword: document.getElementById('as-confirm').value,
        photo: Auth.adminCam.getPhoto(),
        otpCode: document.getElementById('as-otp').value.trim(),
      };
      if (!EMAIL_PATTERN.test(payload.email)) { err.textContent = 'A valid email address is required.'; return; }
      if (!payload.photo) { err.textContent = 'Please capture your photo first.'; return; }
      try {
        const r = await API.post('/api/auth/admin/signup', payload);
        App.loginSuccess('admin', r.admin);
      } catch (e) { err.textContent = e.message; }
    });

    document.getElementById('al-submit').addEventListener('click', async () => {
      const err = document.getElementById('al-error');
      err.textContent = '';
      try {
        const r = await API.post('/api/auth/admin/login', {
          phone: document.getElementById('al-phone').value.trim(),
          password: document.getElementById('al-password').value,
        });
        App.loginSuccess('admin', r.admin);
      } catch (e) { err.textContent = e.message; }
    });
  },
};
