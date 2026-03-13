/**
 * PDF Password Remover — Client-Side
 * Uses pdf.js to decrypt and render pages, then jsPDF to assemble a new unprotected PDF.
 */

// ===== STATE =====
let selectedFile = null;
let processedBlobUrl = null;
let processedFileName = null;

// ===== DOM ELEMENTS =====
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFile');

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
  selectedFile = null;
  if (processedBlobUrl) {
    URL.revokeObjectURL(processedBlobUrl);
    processedBlobUrl = null;
  }
  processedFileName = null;
  fileInput.value = '';

  hideElement(fileInfo);
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
function handleFile(file) {
  if (!file) return;

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showStatus('error', '⚠️', 'Por favor, selecione um arquivo PDF válido.');
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);

  hideStatus();
  showElement(fileInfo);
  showElement(passwordSection);
  unlockBtn.disabled = false;
  unlockBtn.style.display = '';
  hideElement(downloadSection);

  passwordInput.focus();
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
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

dropzone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  handleFile(e.target.files[0]);
});

// Remove file
removeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetAll();
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

// ===== MAIN PROCESS =====
unlockBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  const password = passwordInput.value;

  // UI: show progress, hide others
  hideStatus();
  hideElement(downloadSection);
  showElement(progressSection);
  unlockBtn.disabled = true;
  setProgress(5, 'Carregando PDF...');

  try {
    // 1. Read file as ArrayBuffer
    const arrayBuffer = await selectedFile.arrayBuffer();

    // 2. Load with pdf.js, providing password
    setProgress(10, 'Descriptografando...');

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password || undefined,
    });

    let pdfDoc;
    try {
      pdfDoc = await loadingTask.promise;
    } catch (err) {
      if (err.name === 'PasswordException') {
        if (err.code === 1) {
          // NEED_PASSWORD — no password was provided
          showStatus('error', '🔒', 'Este PDF requer uma senha. Digite a senha acima.');
        } else {
          // INCORRECT_PASSWORD
          showStatus('error', '❌', 'Senha incorreta. Tente novamente.');
        }
      } else {
        showStatus('error', '⚠️', 'Erro ao abrir o PDF: ' + (err.message || err));
      }
      hideElement(progressSection);
      unlockBtn.disabled = false;
      return;
    }

    const totalPages = pdfDoc.numPages;
    setProgress(15, `Processando ${totalPages} página(s)...`);

    // 3. Render each page to canvas, then add to jsPDF
    // Get first page to determine dimensions
    const firstPage = await pdfDoc.getPage(1);
    const scale = 2; // Higher scale = better quality
    const firstViewport = firstPage.getViewport({ scale });

    // Create jsPDF with first page dimensions (in mm)
    const pxToMm = 25.4 / (72 * scale); // 72 DPI base
    const pageWidthMm = firstViewport.width * pxToMm;
    const pageHeightMm = firstViewport.height * pxToMm;

    const orientation = pageWidthMm > pageHeightMm ? 'l' : 'p';
    const pdf = new jspdf.jsPDF({
      orientation,
      unit: 'mm',
      format: [pageWidthMm, pageHeightMm],
    });

    // Canvas for rendering
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let i = 1; i <= totalPages; i++) {
      const progress = 15 + Math.round((i / totalPages) * 75);
      setProgress(progress, `Renderizando página ${i} de ${totalPages}...`);

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

    // 4. Generate blob and download link
    setProgress(95, 'Finalizando...');

    const blob = pdf.output('blob');
    processedBlobUrl = URL.createObjectURL(blob);
    processedFileName = selectedFile.name.replace(/\.pdf$/i, '') + '_sem_senha.pdf';

    setProgress(100, 'Concluído!');

    // Small delay for UI feel
    await new Promise((r) => setTimeout(r, 400));

    hideElement(progressSection);
    unlockBtn.style.display = 'none';
    showStatus('success', '✅', 'PDF desbloqueado com sucesso!');
    showElement(downloadSection);

  } catch (err) {
    console.error('Unexpected error:', err);
    showStatus('error', '⚠️', 'Erro inesperado: ' + (err.message || err));
    hideElement(progressSection);
    unlockBtn.disabled = false;
  }
});
