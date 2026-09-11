/* CropPDFPDF - Main Tool Script */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const state = {
  pdfDoc: null,
  pdfBytes: null,
  fileName: '',
  numPages: 0,
  scale: 1.0,
  pages: [],          // only page 1 for preview
  cropBox: null,      // single crop box {x, y, w, h} relative to page 1 canvas
  isDrawing: false,
  isResizing: false,
  isDragging: false,
  startX: 0,
  startY: 0,
  currentBox: null,
  resizeHandle: null
};


// DOM refs
const uploadZone = document.getElementById('uploadZone');
const pdfInput = document.getElementById('pdfInput');
const uploadBtn = document.getElementById('uploadBtn');
const workspace = document.getElementById('workspace');
const pagesContainer = document.getElementById('pagesContainer');
const fileNameEl = document.getElementById('fileName');
const pageCountEl = document.getElementById('pageCount');
const cropBtn = document.getElementById('cropBtn');
const resetBtn = document.getElementById('resetBtn');
const zoomRange = document.getElementById('zoomRange');

const zoomValue = document.getElementById('zoomValue');
const cropCoords = document.getElementById('cropCoords');
const menuToggle = document.getElementById('menuToggle');
const wmEnable = document.getElementById('wmEnable');
const wmOptions = document.getElementById('wmOptions');
const wmText = document.getElementById('wmText');
const wmPosition = document.getElementById('wmPosition');
const wmOpacity = document.getElementById('wmOpacity');
const wmOpacityVal = document.getElementById('wmOpacityVal');
const wmSize = document.getElementById('wmSize');
const wmSizeVal = document.getElementById('wmSizeVal');


// ===== Upload Handling =====
uploadBtn.addEventListener('click', () => pdfInput.click());
uploadZone.addEventListener('click', (e) => {
  if (e.target === uploadZone || e.target.closest('.upload-zone')) pdfInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

pdfInput.addEventListener('change', () => {
  if (pdfInput.files.length) handleFile(pdfInput.files[0]);
});

async function handleFile(file) {
  if (file.type !== 'application/pdf') {
    alert('Please upload a PDF file.');
    return;
  }
  state.fileName = file.name;
  state.pdfBytes = await file.arrayBuffer();
  try {
    state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice(0) }).promise;
    state.numPages = state.pdfDoc.numPages;
    fileNameEl.textContent = state.fileName;
    pageCountEl.textContent = `${state.numPages} page${state.numPages > 1 ? 's' : ''}`;
    uploadZone.style.display = 'none';
    workspace.style.display = 'block';
    await renderAllPages();
  } catch (err) {
    console.error(err);
    alert('Failed to load PDF. Please try another file.');
  }
}

// ===== Render ONLY First Page (fast even for 500+ page PDFs) =====
async function renderAllPages() {
  pagesContainer.innerHTML = '';
  state.pages = [];
  state.cropBox = null;

  // Only render page 1 — like an open book on the table
  const page = await state.pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: state.scale });
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.page = 1;

  const label = document.createElement('div');
  label.className = 'page-label';
  label.textContent = state.numPages > 1
    ? `Page 1 of ${state.numPages}  •  Crop will apply to all pages`
    : `Page 1`;
  wrapper.appendChild(label);

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  wrapper.appendChild(canvas);
  pagesContainer.appendChild(wrapper);

  state.pages.push({ canvas, wrapper, pageNum: 1, viewport, page });

  // Mouse events for crop selection (only on page 1)
  setupCropEvents(wrapper, canvas);
}


// ===== Crop Selection Logic (single page only) =====
function setupCropEvents(wrapper, canvas) {
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Click inside existing box → drag
    if (state.cropBox && isInsideBox(x, y, state.cropBox)) {
      state.isDragging = true;
      state.startX = x - state.cropBox.x;
      state.startY = y - state.cropBox.y;
      state.currentBox = wrapper.querySelector('.crop-box');
      return;
    }

    // Start new selection
    state.isDrawing = true;
    state.startX = x;
    state.startY = y;

    // Clear previous box
    const old = wrapper.querySelector('.crop-box');
    if (old) old.remove();
    state.cropBox = null;

    state.currentBox = createCropBoxEl(wrapper);
    updateBox(state.currentBox, x, y, 0, 0);
  });

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e) {
  if (!state.isDrawing && !state.isDragging && !state.isResizing) return;
  const pageData = state.pages[0];
  if (!pageData) return;

  const rect = pageData.canvas.getBoundingClientRect();
  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;
  x = Math.max(0, Math.min(x, pageData.canvas.width));
  y = Math.max(0, Math.min(y, pageData.canvas.height));

  if (state.isDrawing) {
    const w = x - state.startX;
    const h = y - state.startY;
    const boxX = w < 0 ? x : state.startX;
    const boxY = h < 0 ? y : state.startY;
    updateBox(state.currentBox, boxX, boxY, Math.abs(w), Math.abs(h));
    updateCoordsDisplay(boxX, boxY, Math.abs(w), Math.abs(h));
  } else if (state.isDragging && state.currentBox && state.cropBox) {
    let newX = x - state.startX;
    let newY = y - state.startY;
    newX = Math.max(0, Math.min(newX, pageData.canvas.width - state.cropBox.w));
    newY = Math.max(0, Math.min(newY, pageData.canvas.height - state.cropBox.h));
    updateBox(state.currentBox, newX, newY, state.cropBox.w, state.cropBox.h);
    state.cropBox = { x: newX, y: newY, w: state.cropBox.w, h: state.cropBox.h };
    updateCoordsDisplay(newX, newY, state.cropBox.w, state.cropBox.h);
  } else if (state.isResizing && state.currentBox) {
    handleResize(e, pageData);
  }
}

function onMouseUp() {
  if (state.isDrawing || state.isDragging || state.isResizing) {
    if (state.currentBox) {
      const box = {
        x: parseFloat(state.currentBox.style.left),
        y: parseFloat(state.currentBox.style.top),
        w: parseFloat(state.currentBox.style.width),
        h: parseFloat(state.currentBox.style.height)
      };
      if (box.w > 5 && box.h > 5) {
        state.cropBox = box;
        addResizeHandles(state.currentBox);
        cropBtn.disabled = false;
      } else {
        state.currentBox.remove();
        state.cropBox = null;
      }
    }
  }
  state.isDrawing = false;
  state.isDragging = false;
  state.isResizing = false;
  state.resizeHandle = null;
}

function handleResize(e, pageData) {
  if (!state.cropBox || !state.resizeHandle) return;
  const rect = pageData.canvas.getBoundingClientRect();
  let x = Math.max(0, Math.min(e.clientX - rect.left, pageData.canvas.width));
  let y = Math.max(0, Math.min(e.clientY - rect.top, pageData.canvas.height));

  let { x: bx, y: by, w, h } = state.cropBox;
  const handle = state.resizeHandle;

  if (handle.includes('e')) w = x - bx;
  if (handle.includes('s')) h = y - by;
  if (handle.includes('w')) {
    w = bx + w - x;
    bx = x;
  }
  if (handle.includes('n')) {
    h = by + h - y;
    by = y;
  }

  w = Math.max(10, w);
  h = Math.max(10, h);
  bx = Math.max(0, Math.min(bx, pageData.canvas.width - w));
  by = Math.max(0, Math.min(by, pageData.canvas.height - h));

  updateBox(state.currentBox, bx, by, w, h);
  state.cropBox = { x: bx, y: by, w, h };
  updateCoordsDisplay(bx, by, w, h);
}

// ===== Box Helpers =====
function createCropBoxEl(wrapper) {
  const box = document.createElement('div');
  box.className = 'crop-box';
  wrapper.appendChild(box);
  return box;
}

function updateBox(el, x, y, w, h) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.width = w + 'px';
  el.style.height = h + 'px';
}

function isInsideBox(x, y, box) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

function addResizeHandles(boxEl) {
  if (boxEl.querySelector('.handle')) return;
  const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
  handles.forEach(h => {
    const handle = document.createElement('div');
    handle.className = `handle ${h}`;
    handle.dataset.handle = h;
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      state.isResizing = true;
      state.resizeHandle = h;
      state.currentBox = boxEl;
    });
    boxEl.appendChild(handle);
  });
}

function updateCoordsDisplay(x, y, w, h) {
  cropCoords.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}  W: ${Math.round(w)}  H: ${Math.round(h)}`;
}


// ===== Zoom =====
zoomRange.addEventListener('input', async () => {
  state.scale = parseFloat(zoomRange.value);
  zoomValue.textContent = Math.round(state.scale * 100) + '%';
  if (state.pdfDoc) await renderAllPages();
});

document.getElementById('fitWidthBtn')?.addEventListener('click', async () => {
  if (!state.pages.length) return;
  const containerWidth = document.getElementById('previewScroll').clientWidth - 60;
  const firstPage = await state.pdfDoc.getPage(1);
  const vp = firstPage.getViewport({ scale: 1 });
  state.scale = containerWidth / vp.width;
  zoomRange.value = state.scale;
  zoomValue.textContent = Math.round(state.scale * 100) + '%';
  await renderAllPages();
});

document.getElementById('fitPageBtn')?.addEventListener('click', async () => {
  state.scale = 1;
  zoomRange.value = 1;
  zoomValue.textContent = '100%';
  await renderAllPages();
});

// ===== Watermark UI =====
wmEnable.addEventListener('change', () => {
  wmOptions.style.display = wmEnable.checked ? 'flex' : 'none';
});
wmOpacity.addEventListener('input', () => {
  wmOpacityVal.textContent = wmOpacity.value + '%';
});
wmSize.addEventListener('input', () => {
  wmSizeVal.textContent = wmSize.value;
});


// ===== Crop & Download (with optional Watermark) =====
// Crop box is drawn on Page 1 only → same relative crop applied to ALL pages
cropBtn.addEventListener('click', async () => {
  if (!state.cropBox) {
    alert('Please draw a crop selection on the first page.');
    return;
  }

  cropBtn.disabled = true;
  cropBtn.innerHTML = '<span class="spinner"></span> Processing...';

  try {
    const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;
    const srcDoc = await PDFDocument.load(state.pdfBytes);
    const newDoc = await PDFDocument.create();
    const font = await newDoc.embedFont(StandardFonts.HelveticaBold);

    const addWm = wmEnable.checked && wmText.value.trim().length > 0;
    const wmStr = wmText.value.trim() || 'CropPDFPDF';
    const opacity = parseInt(wmOpacity.value) / 100;
    const fontSize = parseInt(wmSize.value);
    const position = wmPosition.value;

    // Relative crop from page 1 canvas (0–1)
    const page1Canvas = state.pages[0].canvas;
    const rel = {
      x: state.cropBox.x / page1Canvas.width,
      y: state.cropBox.y / page1Canvas.height,
      w: state.cropBox.w / page1Canvas.width,
      h: state.cropBox.h / page1Canvas.height
    };

    for (let i = 1; i <= state.numPages; i++) {
      const [copiedPage] = await newDoc.copyPages(srcDoc, [i - 1]);
      const page = srcDoc.getPage(i - 1);
      const { width, height } = page.getSize();

      // Apply same relative crop to every page
      const cropX = rel.x * width;
      const cropW = rel.w * width;
      const cropH = rel.h * height;
      const cropY = height - (rel.y * height) - cropH;

      copiedPage.setCropBox(cropX, cropY, cropW, cropH);
      copiedPage.setMediaBox(cropX, cropY, cropW, cropH);

      // Optional watermark
      if (addWm) {
        const pageW = cropW;
        const pageH = cropH;
        const textWidth = font.widthOfTextAtSize(wmStr, fontSize);
        let x = 0, y = 0, rotate = 0;

        switch (position) {
          case 'center':
            x = cropX + (pageW - textWidth) / 2;
            y = cropY + pageH / 2 - fontSize / 3;
            break;
          case 'diagonal':
            x = cropX + pageW * 0.15;
            y = cropY + pageH * 0.25;
            rotate = 35;
            break;
          case 'bottom-right':
            x = cropX + pageW - textWidth - 20;
            y = cropY + 20;
            break;
          case 'bottom-left':
            x = cropX + 20;
            y = cropY + 20;
            break;
          case 'top-right':
            x = cropX + pageW - textWidth - 20;
            y = cropY + pageH - fontSize - 15;
            break;
          case 'top-left':
            x = cropX + 20;
            y = cropY + pageH - fontSize - 15;
            break;
        }

        copiedPage.drawText(wmStr, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.4, 0.4, 0.4),
          opacity,
          rotate: degrees(rotate)
        });
      }

      newDoc.addPage(copiedPage);
    }

    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = addWm ? '_cropped_wm.pdf' : '_cropped.pdf';
    a.download = state.fileName.replace(/\.pdf$/i, '') + suffix;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('Processing failed. Please try again.');
  } finally {
    cropBtn.disabled = false;
    cropBtn.textContent = 'Crop & Download';
  }
});



// ===== Reset =====
resetBtn.addEventListener('click', () => {
  state.pdfDoc = null;
  state.pdfBytes = null;
  state.pages = [];
  state.cropBox = null;
  pagesContainer.innerHTML = '';
  workspace.style.display = 'none';
  uploadZone.style.display = 'block';
  pdfInput.value = '';
  cropBtn.disabled = true;
  cropCoords.textContent = '';
  state.scale = 1;
  zoomRange.value = 1;
  zoomValue.textContent = '100%';
  if (wmEnable) wmEnable.checked = false;
  if (wmOptions) wmOptions.style.display = 'none';
});


// ===== Mobile menu =====
if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    document.querySelector('.nav').classList.toggle('open');
  });
}
