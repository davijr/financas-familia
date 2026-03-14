/**
 * PDF Password Remover — Client-Side
 * Uses pdf.js to decrypt and render pages, then jsPDF to assemble new unprotected PDFs.
 * Supports batch processing using JSZip.
 */

// ===== STATE =====
let selectedFiles = [];
let processedBlobUrl = null;
let processedFileName = null;

// ===== DOM ELEMENTS =====
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');

const passwordSection = document.getElementById('passwordSection');
const passwordInput = document.getElementById('passwordInput');
const togglePasswordBtn = document.getElementById('togglePassword');

const unlockBtn = document.getElementById('unlockBtn');

const progressSection = document.getElementById('progressSection');
const progressBarFill = document.getElementById('progressBarFill');
const progressText = document.getElementById('progressText');

const statusMessage = document.getElementById('statusMessage');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');

const downloadSection = document.getElementById('downloadSection');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

// ===== INIT pdf.js =====
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';

// ===== UTILITY =====
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showElement(el) {
  el.classList.add('visible');
}

function hideElement(el) {
  el.classList.remove('visible');
}

function showStatus(type, icon, message) {
  statusMessage.className = `status-message visible status-message--${type}`;
  statusIcon.textContent = icon;
  statusText.textContent = message;
}

function hideStatus() {
  hideElement(statusMessage);
}

function setProgress(percent, text) {
  progressBarFill.style.width = percent + '%';
  progressText.textContent = text;
}

function resetAll() {
  selectedFiles = [];
  if (processedBlobUrl) {
    URL.revokeObjectURL(processedBlobUrl);
    processedBlobUrl = null;
  }
  processedFileName = null;
  fileInput.value = '';

  renderFileList();
  hideElement(passwordSection);
  hideElement(progressSection);
  hideElement(downloadSection);
  hideStatus();

  unlockBtn.disabled = true;
  unlockBtn.style.display = '';
  passwordInput.value = '';
  setProgress(0, '');

  dropzone.style.display = '';
}

// ===== FILE HANDLING =====
function handleFiles(files) {
  if (!files || files.length === 0) return;

  let addedCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      // Prevent duplicates by name
      if (!selectedFiles.some(f => f.name === file.name)) {
        selectedFiles.push(file);
        addedCount++;
      }
    }
  }

  if (addedCount > 0) {
    renderFileList();
    hideStatus();
    showElement(passwordSection);
    
    unlockBtn.textContent = selectedFiles.length > 1 
      ? `🔓 Remover Senha (${selectedFiles.length} arquivos)` 
      : `🔓 Remover Senha`;
      
    unlockBtn.disabled = false;
    unlockBtn.style.display = '';
    hideElement(downloadSection);
    passwordInput.focus();
  } else if (files.length > 0 && selectedFiles.length === 0) {
    showStatus('error', '⚠️', 'Por favor, selecione apenas arquivos PDF válidos.');
  }
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
  
  if (selectedFiles.length === 0) {
    resetAll();
  } else {
    unlockBtn.textContent = selectedFiles.length > 1 
      ? `🔓 Remover Senha (${selectedFiles.length} arquivos)` 
      : `🔓 Remover Senha`;
  }
}

function renderFileList() {
  fileList.innerHTML = '';
  
  if (selectedFiles.length === 0) {
    hideElement(fileList);
    return;
  }

  showElement(fileList);
  
  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.id = `file-item-${index}`;
    
    item.innerHTML = `
      <span class="file-item__icon">📄</span>
      <div class="file-item__details">
        <div class="file-item__name" title="${file.name}">${file.name}</div>
        <div class="file-item__size">${formatFileSize(file.size)}</div>
      </div>
      <span class="file-item__status" id="file-status-${index}"></span>
      <button class="file-item__remove" onclick="removeFile(${index})" title="Remover arquivo">✕</button>
    `;
    
    fileList.appendChild(item);
  });
}

function updateFileStatus(index, status, isError = false) {
  const statusEl = document.getElementById(`file-status-${index}`);
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = `file-item__status ${isError ? 'error' : 'success'}`;
  }
}

// Drag & Drop
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

dropzone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

// Toggle password visibility
togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
});

// Allow Enter key to submit
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    unlockBtn.click();
  }
});

// Expose removeFile to global scope for inline onclick handler
window.removeFile = removeFile;

// Reset
resetBtn.addEventListener('click', resetAll);

// Download
downloadBtn.addEventListener('click', () => {
  if (!processedBlobUrl) return;
  const a = document.createElement('a');
  a.href = processedBlobUrl;
  a.download = processedFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// ===== CORE PROCESSING FUNCTION =====
async function processSingleFile(file, password, fileIndex, totalFiles) {
  const baseProgress = (fileIndex / totalFiles) * 100;
  const progressShare = 100 / totalFiles;
  
  const updateProgress = (localPercent, text) => {
    const overallProgress = baseProgress + (localPercent * progressShare / 100);
    setProgress(overallProgress, text);
  };

  updateProgress(5, `Processando: ${file.name}...`);
  updateFileStatus(fileIndex, 'Processando...');

  const arrayBuffer = await file.arrayBuffer();

  updateProgress(10, `Descriptografando: ${file.name}...`);
  
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    password: password || undefined,
  });

  let pdfDoc;
  try {
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    let errorMsg = 'Erro desconhecido';
    if (err.name === 'PasswordException') {
      if (err.code === 1) {
        errorMsg = 'Senha ausente';
      } else {
        errorMsg = 'Senha incorreta';
      }
    } else {
      errorMsg = 'Arquivo corrompido';
    }
    updateFileStatus(fileIndex, 'Falhou', true);
    throw new Error(`${file.name}: ${errorMsg}`);
  }

  const totalPages = pdfDoc.numPages;
  updateProgress(15, `Desenhando ${totalPages} página(s)...`);

  const firstPage = await pdfDoc.getPage(1);
  const scale = 2; 
  const firstViewport = firstPage.getViewport({ scale });

  const pxToMm = 25.4 / (72 * scale);
  const pageWidthMm = firstViewport.width * pxToMm;
  const pageHeightMm = firstViewport.height * pxToMm;

  const orientation = pageWidthMm > pageHeightMm ? 'l' : 'p';
  const pdf = new window.jspdf.jsPDF({
    orientation,
    unit: 'mm',
    format: [pageWidthMm, pageHeightMm],
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  for (let i = 1; i <= totalPages; i++) {
    const progress = 15 + Math.round((i / totalPages) * 75);
    updateProgress(progress, `Renderizando pág ${i}/${totalPages} de ${file.name}...`);

    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const currentWidthMm = viewport.width * pxToMm;
    const currentHeightMm = viewport.height * pxToMm;

    if (i > 1) {
      const pageOrientation = currentWidthMm > currentHeightMm ? 'l' : 'p';
      pdf.addPage([currentWidthMm, currentHeightMm], pageOrientation);
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, currentWidthMm, currentHeightMm);
  }

  updateProgress(95, `Finalizando ${file.name}...`);
  updateFileStatus(fileIndex, 'Concluído', false);
  
  return pdf.output('blob');
}

// ===== MAIN PROCESS =====
unlockBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const password = passwordInput.value;

  // UI Setup
  hideStatus();
  hideElement(downloadSection);
  showElement(progressSection);
  unlockBtn.disabled = true;
  
  // Disable remove buttons during processing
  document.querySelectorAll('.file-item__remove').forEach(btn => btn.style.display = 'none');

  try {
    const processedBlobs = [];
    const errors = [];
    
    // Process files sequentially
    for (let i = 0; i < selectedFiles.length; i++) {
      try {
        const fileBlob = await processSingleFile(selectedFiles[i], password, i, selectedFiles.length);
        processedBlobs.push({
          name: selectedFiles[i].name.replace(/\.pdf$/i, '') + '_sem_senha.pdf',
          blob: fileBlob
        });
      } catch (err) {
        console.error(err);
        errors.push(err.message);
      }
    }

    if (processedBlobs.length === 0) {
      throw new Error(errors[0] || 'Nenhum arquivo pôde ser processado.');
    }

    setProgress(98, 'Preparando download...');

    if (processedBlobs.length === 1) {
      // Single file download
      processedBlobUrl = URL.createObjectURL(processedBlobs[0].blob);
      processedFileName = processedBlobs[0].name;
    } else {
      // Multiple files -> ZIP
      const zip = new JSZip();
      processedBlobs.forEach(item => {
        zip.file(item.name, item.blob);
      });
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      processedBlobUrl = URL.createObjectURL(zipBlob);
      processedFileName = 'PDFs_sem_senha.zip';
    }

    setProgress(100, 'Concluído!');
    await new Promise((r) => setTimeout(r, 400)); // UI delay

    hideElement(progressSection);
    unlockBtn.style.display = 'none';
    
    if (errors.length > 0) {
      showStatus('warning', '⚠️', `Concluído com avisos: ${processedBlobs.length} sucesso(s), ${errors.length} erro(s).`);
    } else {
      showStatus('success', '✅', 'Processamento concluído com sucesso!');
    }
    
    showElement(downloadSection);

  } catch (err) {
    console.error('Batch process error:', err);
    showStatus('error', '❌', err.message || 'Erro inesperado.');
    hideElement(progressSection);
    unlockBtn.disabled = false;
    
    // Restore remove buttons
    document.querySelectorAll('.file-item__remove').forEach(btn => btn.style.display = '');
  }
});
