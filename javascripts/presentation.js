// Slide viewer for the interim presentation PDF, rendered with PDF.js so it works on every browser.
(() => {
  const viewer = document.querySelector('.slide-viewer');
  if (!viewer) return;

  const PDFJS_VERSION = '3.11.174';
  const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

  const stage = viewer.querySelector('.slide-stage');
  const canvas = viewer.querySelector('.slide-canvas');
  const status = viewer.querySelector('.slide-status');
  const currentLabel = viewer.querySelector('[data-current]');
  const totalLabel = viewer.querySelector('[data-total]');
  const prevButton = viewer.querySelector('[data-action="prev"]');
  const nextButton = viewer.querySelector('[data-action="next"]');
  const fullscreenButton = viewer.querySelector('[data-action="fullscreen"]');

  let pdf = null;
  let pageNumber = 1;
  let rendering = false;
  let pendingPage = null;

  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });

  const showError = () => {
    const link = viewer.dataset.pdf;
    status.hidden = false;
    status.innerHTML = `The slides could not be displayed here. <a href="${link}" target="_blank" rel="noopener">Open the PDF directly</a>.`;
    canvas.hidden = true;
  };

  const updateControls = () => {
    currentLabel.textContent = pageNumber;
    prevButton.disabled = pageNumber <= 1;
    nextButton.disabled = pageNumber >= pdf.numPages;
  };

  const render = async number => {
    // Only one render may draw on the canvas at a time; queue the latest request.
    if (rendering) {
      pendingPage = number;
      return;
    }
    rendering = true;
    pageNumber = number;
    updateControls();

    try {
      const page = await pdf.getPage(number);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = stage.clientWidth / baseViewport.width;
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * outputScale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;

      // 'print' intent draws each slide in one pass instead of across animation frames,
      // so slides still finish rendering in background tabs or throttled embedded views.
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise;
      status.hidden = true;
    } finally {
      rendering = false;
    }

    if (pendingPage !== null) {
      const next = pendingPage;
      pendingPage = null;
      render(next);
    }
  };

  const go = delta => {
    if (!pdf) return;
    const target = Math.min(Math.max((pendingPage ?? pageNumber) + delta, 1), pdf.numPages);
    if (target !== pageNumber || rendering) render(target);
  };

  prevButton.addEventListener('click', () => go(-1));
  nextButton.addEventListener('click', () => go(1));

  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      go(1);
    }
  });

  // Swipe left/right on touch screens.
  let touchStartX = null;
  stage.addEventListener('touchstart', event => {
    touchStartX = event.touches[0].clientX;
  }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (touchStartX === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX = null;
  });

  if (viewer.requestFullscreen) {
    fullscreenButton.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else viewer.requestFullscreen();
    });
  } else {
    fullscreenButton.hidden = true;
  }

  let resizeTimer = null;
  const rerender = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => pdf && render(pageNumber), 150);
  };
  window.addEventListener('resize', rerender);
  document.addEventListener('fullscreenchange', rerender);

  loadScript(`${PDFJS_BASE}/pdf.min.js`)
    .then(() => {
      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      return pdfjsLib.getDocument(viewer.dataset.pdf).promise;
    })
    .then(doc => {
      pdf = doc;
      totalLabel.textContent = pdf.numPages;
      return render(1);
    })
    .catch(showError);
})();
