function runSplashSequence(onDone) {
  const letters = document.getElementById('splash-letters');
  const cross = document.getElementById('splash-cross');
  const tagline = document.getElementById('splash-tagline');

  // Let the letters bounce in fully, then slide them together and merge into the plus/cross shape.
  setTimeout(() => letters.classList.add('merge'), 1500);   // letters converge toward the center
  setTimeout(() => cross.classList.add('show'), 2300);       // cross appears just as letters finish merging
  setTimeout(() => tagline.classList.add('show'), 2500);
  setTimeout(() => {
    document.getElementById('splash-view').classList.add('hidden');
    onDone();
  }, 3600);
}
