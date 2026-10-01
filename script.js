/* CropPDFPDF - Main Tool Script - MOBILE TOUCH SUPPORT ADDED */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const state = {
  pdfDoc: null,
  pdfBytes: null,
  fileName: '',
  numPages: 0,
  scale: 1.0,
  pages: [],
  cropBox: null,
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

// ===== Upload Handling =====
if(uploadBtn) uploadBtn.addEventListener('click', () => pdfInput.click());

if(uploadZone) {
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
}

if(pdfInput) {
    pdfInput.addEventListener('change', () => {
      if (pdfInput.files.length) handleFile(pdfInput.files[0]);
    });
}

async function handleFile(file) {
  if (file.type !== 'application/pdf') {
    alert('Please upload a valid PDF file.');
    return;
  }
  state.fileName = file.name;
  state.pdfBytes = await file.arrayBuffer();
  try {
    state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice(0) }).promise;
    state.numPages = state.pdfDoc.numPages;
    if(fileNameEl) fileNameEl.textContent = state.fileName;
    if(pageCountEl) pageCountEl.textContent = `${state.numPages} page${state.numPages > 1 ? 's' : ''}`;
    
    if(uploadZone) uploadZone.style.display = 'none';
    if(workspace) workspace.style.display = 'block';
    
    if(cropBtn) {
        cropBtn.disabled = true;
        cropBtn.innerText = "Crop files! »";
    }
    
    await renderAllPages();
  } catch (err) {
    console.error(err);
    alert('Failed to load PDF. Please try another file.');
  }
}

// ===== Render ONLY First Page =====
async function renderAllPages() {
  if(!pagesContainer) return;
  pagesContainer.innerHTML = '';
  state.pages = [];
  state.cropBox = null;

  const page = await state.pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: state.scale });
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.page = 1;

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  // Prevent mobile screen scrolling when trying to draw on the canvas
  canvas.style.touchAction = 'none'; 
  
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  wrapper.appendChild(canvas);
  pagesContainer.appendChild(wrapper);

  state.pages.push({ canvas, wrapper, pageNum: 1, viewport, page });
  setupCropEvents(wrapper, canvas);
}

// ===== Crop Selection Logic (Mouse + Mobile Touch) =====
function setupCropEvents(wrapper, canvas) {
  const startAction = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (state.cropBox && isInsideBox(x, y, state.cropBox)) {
      state.isDragging = true;
      state.startX = x - state.cropBox.x;
      state.startY = y - state.cropBox.y;
      state.currentBox = wrapper.querySelector('.crop-box');
      return;
    }

    state.isDrawing = true;
    state.startX = x;
    state.startY = y;

    const old = wrapper.querySelector('.crop-box');
    if (old) old.remove();
    state.cropBox = null;
    if(cropBtn) cropBtn.disabled = true;

    state.currentBox = createCropBoxEl(wrapper);
    updateBox(state.currentBox, x, y, 0, 0);
  };

  canvas.addEventListener('mousedown', startAction);
  canvas.addEventListener('touchstart', startAction, { passive: false });

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('touchmove', onMouseMove, { passive: false });

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('touchend', onMouseUp);
}

function onMouseMove(e) {
  if (!state.isDrawing && !state.isDragging && !state.isResizing) return;
  const pageData = state.pages[0];
  if (!pageData) return;

  // Stop page scrolling on mobile while drawing crop box
  if(e.type === 'touchmove' && e.cancelable) {
      e.preventDefault(); 
  }

  let clientX = e.clientX || (e.touches && e.touches[0].clientX);
  let clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  const rect = pageData.canvas.getBoundingClientRect();
  let x = Math.max(0, Math.min(clientX - rect.left, pageData.canvas.width));
  let y = Math.max(0, Math.min(clientY - rect.top, pageData.canvas.height));

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
    handleResize(x, y, pageData);
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
        if(cropBtn) cropBtn.disabled = false;
      } else {
        state.currentBox.remove();
        state.cropBox = null;
        if(cropBtn) cropBtn.disabled = true;
      }
    }
  }
  state.isDrawing = false;
  state.isDragging = false;
  state.isResizing = false;
  state.resizeHandle = null;
}

function handleResize(mouseX, mouseY, pageData) {
  if (!state.cropBox || !state.resizeHandle) return;
  
  let x = mouseX;
  let y = mouseY;
  let { x: bx, y: by, w, h } = state.cropBox;
  const handle = state.resizeHandle;

  if (handle.includes('e')) w = x - bx;
  if (handle.includes('s')) h = y - by;
  if (handle.includes('w')) { w = bx + w - x; bx = x; }
  if (handle.includes('n')) { h = by + h - y; by = y; }

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
    
    const startResize = (e) => {
      e.stopPropagation();
      state.isResizing = true;
      state.resizeHandle = h;
      state.currentBox = boxEl;
    };

    handle.addEventListener('mousedown', startResize);
    handle.addEventListener('touchstart', startResize, { passive: false });
    boxEl.appendChild(handle);
  });
}

function updateCoordsDisplay(x, y, w, h) {
  if(cropCoords) cropCoords.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}  W: ${Math.round(w)}  H: ${Math.round(h)}`;
}

// ===== Zoom =====
if(zoomRange) {
    zoomRange.addEventListener('input', async () => {
      state.scale = parseFloat(zoomRange.value);
      if(zoomValue) zoomValue.textContent = Math.round(state.scale * 100) + '%';
      if (state.pdfDoc) await renderAllPages();
    });
}

document.getElementById('fitWidthBtn')?.addEventListener('click', async () => {
  if (!state.pages.length) return;
  const containerWidth = document.getElementById('previewScroll').clientWidth - 60;
  const firstPage = await state.pdfDoc.getPage(1);
  const vp = firstPage.getViewport({ scale: 1 });
  state.scale = containerWidth / vp.width;
  if(zoomRange) zoomRange.value = state.scale;
  if(zoomValue) zoomValue.textContent = Math.round(state.scale * 100) + '%';
  await renderAllPages();
});

document.getElementById('fitPageBtn')?.addEventListener('click', async () => {
  state.scale = 1;
  if(zoomRange) zoomRange.value = 1;
  if(zoomValue) zoomValue.textContent = '100%';
  await renderAllPages();
});

// ===== Crop & Download =====
if(cropBtn) {
    cropBtn.addEventListener('click', async () => {
      if (!state.cropBox) {
        alert('Please draw a crop selection on the image first.');
        return;
      }

      cropBtn.disabled = true;
      cropBtn.innerText = 'Processing...';

      try {
        const { PDFDocument } = PDFLib;
        const srcDoc = await PDFDocument.load(state.pdfBytes);
        const newDoc = await PDFDocument.create();

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

          const cropX = rel.x * width;
          const cropW = rel.w * width;
          const cropH = rel.h * height;
          const cropY = height - (rel.y * height) - cropH;

          copiedPage.setCropBox(cropX, cropY, cropW, cropH);
          copiedPage.setMediaBox(cropX, cropY, cropW, cropH);
          newDoc.addPage(copiedPage);
        }

        const pdfBytes = await newDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = state.fileName.replace(/\.pdf$/i, '') + '_cropped.pdf';
        document.body.appendChild(a);
        a.click();
        
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
      } catch (err) {
        console.error(err);
        alert('Processing failed. Please try again.');
      } finally {
        cropBtn.disabled = false;
        cropBtn.innerText = 'Crop files! »';
      }
    });
}

// ===== Reset (Start Over) =====
if(resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.pdfDoc = null;
      state.pdfBytes = null;
      state.pages = [];
      state.cropBox = null;
      
      if(pagesContainer) pagesContainer.innerHTML = '';
      if(workspace) workspace.style.display = 'none';
      if(uploadZone) uploadZone.style.display = 'block';
      if(pdfInput) pdfInput.value = '';
      if(cropBtn) {
          cropBtn.disabled = true;
          cropBtn.innerText = 'Crop files! »';
      }
      if(cropCoords) cropCoords.textContent = '';
      
      state.scale = 1;
      if(zoomRange) zoomRange.value = 1;
      if(zoomValue) zoomValue.textContent = '100%';
    });
}
