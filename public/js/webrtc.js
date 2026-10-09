const CallUI = {
  pc: null,
  localStream: null,
  roomId: null,
  isDoctor: false,
  micOn: true,
  camOn: true,
  searchDebounce: null,

  // Google's STUN server plus a free public TURN relay (openrelay.metered.ca) as a
  // fallback — STUN alone can fail to connect on mobile-data or strict corporate
  // networks, and TURN relays the media through a server so the call still connects.
   ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
    { urls: 'turn:global.relay.metered.ca:443', username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'YOUR_USERNAME', credential: 'YOUR_PASSWORD' },
  ],
  offerSent: false,

  init() {
    document.getElementById('call-hangup').addEventListener('click', CallUI.hangup);
    document.getElementById('call-toggle-mic').addEventListener('click', CallUI.toggleMic);
    document.getElementById('call-toggle-cam').addEventListener('click', CallUI.toggleCam);
    document.getElementById('call-rx-add-btn').addEventListener('click', CallUI.addMedicine);
    document.getElementById('call-rx-search').addEventListener('input', CallUI.onSearchInput);
    document.getElementById('call-rx-search').addEventListener('focus', CallUI.onSearchFocus);
    document.addEventListener('click', (e) => {
      const box = document.getElementById('call-rx-search-results');
      if (!box.contains(e.target) && e.target.id !== 'call-rx-search') box.classList.add('hidden');
    });
  },

  async start({ consultation, peerName, peerRole, isDoctor }) {
    CallUI.roomId = consultation.id;
    CallUI.isDoctor = isDoctor;
    CallUI.offerSent = false;
    App.state.activeConsultation = consultation;

    document.getElementById('call-remote-tag').textContent = peerRole + (peerName ? ` - ${peerName}` : '');
    document.getElementById('call-status').textContent = 'Connecting...';
    document.getElementById('call-rx-list').innerHTML = '';
    document.getElementById('call-rx-add-box').classList.toggle('hidden', !isDoctor);
    document.getElementById('call-rx-search').value = '';
    document.getElementById('call-rx-price-hint').textContent = '';
    document.getElementById('call-rx-search-results').classList.add('hidden');

    App.showView('call-view');

    const socket = App.state.socket;
    socket.off('webrtc:offer');
    socket.off('webrtc:answer');
    socket.off('webrtc:ice-candidate');
    socket.off('room:peer-joined');
    socket.off('room:peer-left');
    socket.off('call:hangup');
    socket.off('medicine:added');
    socket.off('call:ended');

    try {
      CallUI.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      alert('Camera/microphone access is required for the video call: ' + e.message);
      return;
    }
    document.getElementById('call-local-video').srcObject = CallUI.localStream;

    CallUI.pc = new RTCPeerConnection({ iceServers: CallUI.ICE_SERVERS });
    CallUI.localStream.getTracks().forEach((track) => CallUI.pc.addTrack(track, CallUI.localStream));

    CallUI.pc.ontrack = (event) => {
      document.getElementById('call-remote-video').srcObject = event.streams[0];
      document.getElementById('call-status').textContent = 'Connected';
    };
    CallUI.pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('webrtc:ice-candidate', { roomId: CallUI.roomId, candidate: event.candidate });
    };

    socket.on('webrtc:offer', async ({ offer }) => {
      await CallUI.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await CallUI.pc.createAnswer();
      await CallUI.pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { roomId: CallUI.roomId, answer });
    });

    socket.on('webrtc:answer', async ({ answer }) => {
      await CallUI.pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('webrtc:ice-candidate', async ({ candidate }) => {
      try { await CallUI.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* ignore */ }
    });

    // The doctor's side always creates the WebRTC offer, but only once we have real
    // confirmation the other side is actually in the room — not a fixed guess-timer,
    // since camera-permission prompts can take an unpredictable amount of time.
    socket.on('room:peer-joined', () => {
      if (isDoctor && !CallUI.offerSent) CallUI.createOffer(socket);
    });

    socket.emit('room:join', { roomId: CallUI.roomId }, ({ priorCount } = {}) => {
      // If someone was already in the room when we joined, the doctor can offer
      // immediately instead of waiting for a 'room:peer-joined' event that already happened.
      if (isDoctor && priorCount > 0 && !CallUI.offerSent) CallUI.createOffer(socket);
    });

    socket.on('medicine:added', ({ consultationId, medicine }) => {
      if (consultationId !== CallUI.roomId) return;
      CallUI.appendRx(medicine);
    });

    socket.on('call:hangup', () => CallUI.teardown(false));
    socket.on('call:ended', ({ medicines, fee, qrCode }) => CallUI.onCallEnded(medicines, fee, qrCode));
  },

  async createOffer(socket) {
    if (!CallUI.pc || CallUI.pc.signalingState === 'closed' || CallUI.offerSent) return;
    CallUI.offerSent = true;
    const offer = await CallUI.pc.createOffer();
    await CallUI.pc.setLocalDescription(offer);
    socket.emit('webrtc:offer', { roomId: CallUI.roomId, offer });
  },

  appendRx(medicine) {
    const list = document.getElementById('call-rx-list');
    const item = document.createElement('div');
    item.className = 'rx-item';
    const label = document.createElement('span');
    label.textContent = `${medicine.name}${medicine.dosage ? ' - ' + medicine.dosage : ''}`;
    item.appendChild(label);
    if (medicine.price) {
      const price = document.createElement('span');
      price.className = 'rx-price';
      price.textContent = `\u20b9${Number(medicine.price).toFixed(2)}`;
      item.appendChild(price);
    }
    list.appendChild(item);
  },

  // Doctor types into (or clicks) the search box -> looks up medicines currently
  // stocked in the ATM (with live prices AND quantity remaining), so they can
  // see exactly what's available and how many units are left before prescribing.
  onSearchInput(e) {
    clearTimeout(CallUI.searchDebounce);
    const query = e.target.value.trim();
    CallUI.searchDebounce = setTimeout(() => CallUI.performMedicineSearch(query), 250);
  },

  onSearchFocus(e) {
    // Show the full current stock list immediately on focus, even before typing,
    // so the doctor can browse quantities without having to search first.
    CallUI.performMedicineSearch(e.target.value.trim());
  },

  async performMedicineSearch(query) {
    const box = document.getElementById('call-rx-search-results');
    try {
      const url = query ? `/api/medicines?search=${encodeURIComponent(query)}` : '/api/medicines';
      const r = await API.get(url);
      box.innerHTML = '';
      if (r.medicines.length === 0) {
        box.innerHTML = query
          ? '<div class="rx-search-empty">No matching medicine in stock — you can still add it as a custom entry below.</div>'
          : '<div class="rx-search-empty">No medicines currently in ATM stock.</div>';
      } else {
        r.medicines.forEach((m) => {
          const row = document.createElement('div');
          row.className = 'rx-search-result';
          const lowStock = m.quantity <= 5 ? ' style="color:var(--warn);"' : '';
          row.innerHTML = `<span>${m.name}</span><span class="rsr-price"${lowStock}>\u20b9${Number(m.price).toFixed(2)} \u00b7 ${m.quantity} left</span>`;
          row.addEventListener('click', () => {
            document.getElementById('call-rx-name').value = m.name;
            document.getElementById('call-rx-price-hint').textContent = `This will cost \u20b9${Number(m.price).toFixed(2)} (${m.quantity} in stock)`;
            document.getElementById('call-rx-search').value = m.name;
            box.classList.add('hidden');
          });
          box.appendChild(row);
        });
      }
      box.classList.remove('hidden');
    } catch (err) { /* ignore search errors — doctor can still type freely */ }
  },

  async addMedicine() {
    const name = document.getElementById('call-rx-name').value.trim() || document.getElementById('call-rx-search').value.trim();
    const dosage = document.getElementById('call-rx-dosage').value.trim();
    if (!name) return;
    try {
      await API.post(`/api/consultations/${CallUI.roomId}/medicine`, { name, dosage });
      document.getElementById('call-rx-name').value = '';
      document.getElementById('call-rx-dosage').value = '';
      document.getElementById('call-rx-search').value = '';
      document.getElementById('call-rx-price-hint').textContent = '';
    } catch (e) { alert(e.message); }
  },

  toggleMic() {
    if (!CallUI.localStream) return;
    CallUI.micOn = !CallUI.micOn;
    CallUI.localStream.getAudioTracks().forEach((t) => (t.enabled = CallUI.micOn));
    document.getElementById('call-toggle-mic').style.opacity = CallUI.micOn ? '1' : '0.4';
  },

  toggleCam() {
    if (!CallUI.localStream) return;
    CallUI.camOn = !CallUI.camOn;
    CallUI.localStream.getVideoTracks().forEach((t) => (t.enabled = CallUI.camOn));
    document.getElementById('call-toggle-cam').style.opacity = CallUI.camOn ? '1' : '0.4';
  },

  async hangup() {
    const socket = App.state.socket;
    socket.emit('call:hangup', { roomId: CallUI.roomId });
    // Either the patient or the doctor can end the call — both go through the
    // same "complete" flow so the consultation always gets marked done and the
    // prescription/dispense screen always appears, regardless of who hangs up.
    try {
      const r = await API.post(`/api/consultations/${CallUI.roomId}/complete`, {});
      CallUI.onCallEnded(r.consultation.prescribedMedicines, r.consultation.fee, r.consultation.qrCode);
    } catch (e) {
      CallUI.teardown(true);
      if (CallUI.isDoctor) {
        App.showView('doctor-dashboard-view');
        DoctorDash.onLogin();
      } else {
        App.showView('patient-dashboard-view');
      }
    }
  },

  onCallEnded(medicines, fee, qrCode) {
    CallUI.teardown(true);
    if (CallUI.isDoctor) {
      App.showView('doctor-dashboard-view');
      DoctorDash.onLogin();
    } else {
      App.showView('patient-dashboard-view');
      const list = document.getElementById('pc-rx-list');
      list.innerHTML = '';
      (medicines || []).forEach((m) => {
        const item = document.createElement('div');
        item.className = 'rx-item';
        const label = document.createElement('span');
        label.textContent = `${m.name}${m.dosage ? ' - ' + m.dosage : ''}`;
        item.appendChild(label);
        if (m.price) {
          const price = document.createElement('span');
          price.className = 'rx-price';
          price.textContent = `\u20b9${Number(m.price).toFixed(2)}`;
          item.appendChild(price);
        }
        list.appendChild(item);
      });

      const f = fee || { consultationFee: 0, medicinesTotal: 0, total: 0 };
      document.getElementById('pc-fee-consult').textContent = `\u20b9${Number(f.consultationFee).toFixed(2)}`;
      document.getElementById('pc-fee-meds').textContent = `\u20b9${Number(f.medicinesTotal).toFixed(2)}`;
      document.getElementById('pc-fee-total').textContent = `\u20b9${Number(f.total).toFixed(2)}`;

      const qrBox = document.getElementById('pc-qr-box');
      if (qrCode) {
        document.getElementById('pc-qr-image').src = qrCode;
        qrBox.classList.remove('hidden');
      } else {
        qrBox.classList.add('hidden');
      }

      document.getElementById('pc-dispense-btn').disabled = false;
      document.getElementById('pc-dispense-success').textContent = '';
      App.openModal('post-call-modal');
      PatientDash.loadHistory();
    }
  },

  teardown(navigateAway) {
    if (CallUI.pc) { CallUI.pc.close(); CallUI.pc = null; }
    if (CallUI.localStream) { CallUI.localStream.getTracks().forEach((t) => t.stop()); CallUI.localStream = null; }
    if (App.state.socket) App.state.socket.emit('room:leave', { roomId: CallUI.roomId });
    if (navigateAway && document.getElementById('call-view').classList.contains('hidden') === false) {
      // caller decides the destination view; nothing else to do here.
    }
  },
};
