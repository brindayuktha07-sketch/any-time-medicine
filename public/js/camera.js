/**
 * Wires up a "capture a photo" widget: Open Camera -> live preview -> Capture -> base64 preview -> Retake.
 * Returns an object with `.getPhoto()` to read the captured base64 dataURL.
 */
function setupCameraCapture({ videoEl, previewEl, startBtn, captureBtn, retakeBtn }) {
  let stream = null;
  let photoDataUrl = null;

  async function openCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      videoEl.srcObject = stream;
      videoEl.classList.remove('hidden');
      previewEl.classList.add('hidden');
      startBtn.classList.add('hidden');
      captureBtn.classList.remove('hidden');
      retakeBtn.classList.add('hidden');
    } catch (err) {
      alert('Could not access camera: ' + err.message + '\n(Camera access requires https or localhost.)');
    }
  }

  function capture() {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth || 320;
    canvas.height = videoEl.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    previewEl.src = photoDataUrl;
    previewEl.classList.remove('hidden');
    videoEl.classList.add('hidden');
    captureBtn.classList.add('hidden');
    retakeBtn.classList.remove('hidden');
    stopStream();
  }

  function retake() {
    photoDataUrl = null;
    previewEl.classList.add('hidden');
    startBtn.classList.remove('hidden');
    retakeBtn.classList.add('hidden');
    openCamera();
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  startBtn.addEventListener('click', openCamera);
  captureBtn.addEventListener('click', capture);
  retakeBtn.addEventListener('click', retake);

  return { getPhoto: () => photoDataUrl };
}
