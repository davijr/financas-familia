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
function fileKind(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.xlsx')) return 'xlsx';
  if (n.endsWith('.zip')) return 'zip';
  return null;
}

const KIND_ICON = { pdf: '📄', xlsx: '📊', zip: '🗜️' };

function baseName(name) {
  return name.replace(/\.(pdf|xlsx|zip)$/i, '');
}

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
    if (fileKind(file.name)) {
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
    showStatus('error', '⚠️', 'Selecione arquivos .pdf, .xlsx ou .zip válidos.');
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
      <span class="file-item__icon">${KIND_ICON[fileKind(file.name)] || '📄'}</span>
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

// ===== CORE PROCESSING DISPATCH =====
async function processFile(file, password, fileIndex, totalFiles) {
  const kind = fileKind(file.name);
  const baseProgress = (fileIndex / totalFiles) * 100;
  const progressShare = 100 / totalFiles;
  const updateProgress = (localPercent, text) => {
    setProgress(baseProgress + (localPercent * progressShare / 100), text);
  };

  updateProgress(5, `Processando: ${file.name}...`);
  updateFileStatus(fileIndex, 'Processando...');

  let blob, outName;
  if (kind === 'pdf') {
    blob = await processPdf(file, password, updateProgress);
    outName = baseName(file.name) + '_sem_senha.pdf';
  } else if (kind === 'zip') {
    blob = await processZip(file, password, updateProgress);
    outName = baseName(file.name) + '_sem_senha.zip';
  } else if (kind === 'xlsx') {
    blob = await processXlsx(file, password, updateProgress);
    outName = baseName(file.name) + '_sem_senha.xlsx';
  } else {
    throw new Error(`${file.name}: formato não suportado`);
  }

  updateProgress(95, `Finalizando ${file.name}...`);
  updateFileStatus(fileIndex, 'Concluído', false);
  return { name: outName, blob };
}

// ===== PDF =====
async function processPdf(file, password, updateProgress) {
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

  return pdf.output('blob');
}

// ===== ZIP =====
async function processZip(file, password, updateProgress) {
  const { ZipReader, ZipWriter, BlobReader, BlobWriter, Uint8ArrayWriter, Uint8ArrayReader } = window.zipjs;
  updateProgress(15, `Lendo ${file.name}...`);

  const reader = new ZipReader(new BlobReader(file));
  let entries;
  try {
    entries = await reader.getEntries();
  } catch (err) {
    throw new Error(`${file.name}: arquivo ZIP corrompido`);
  }

  const anyEncrypted = entries.some((e) => e.encrypted);
  if (anyEncrypted && !password) {
    await reader.close();
    throw new Error(`${file.name}: senha ausente`);
  }

  const writer = new ZipWriter(new BlobWriter('application/zip'));

  let outBlob;
  try {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      updateProgress(15 + Math.round((i / entries.length) * 75), `Descriptografando ${entry.filename}...`);
      if (entry.directory) {
        await writer.add(entry.filename, undefined, { directory: true });
        continue;
      }
      let data;
      try {
        data = await entry.getData(new Uint8ArrayWriter(), { password });
      } catch (err) {
        throw new Error(`${file.name}: senha incorreta`);
      }
      await writer.add(entry.filename, new Uint8ArrayReader(data));
    }
    outBlob = await writer.close();
  } finally {
    await reader.close();
  }

  return outBlob;
}

// ===== XLSX =====
async function processXlsx(file, password, updateProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const head = new Uint8Array(arrayBuffer.slice(0, 8));
  const isCfb = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;

  let zipBytes;
  if (isCfb) {
    updateProgress(20, `Descriptografando ${file.name}...`);
    if (!password) throw new Error(`${file.name}: senha ausente`);
    try {
      zipBytes = await window.ooxmlDecrypt(arrayBuffer, password);
    } catch (err) {
      if (err.wrongPassword) throw new Error(`${file.name}: senha incorreta`);
      throw new Error(`${file.name}: ${err.message}`);
    }
  } else {
    zipBytes = new Uint8Array(arrayBuffer);
  }

  updateProgress(70, `Removendo proteção de edição de ${file.name}...`);
  return stripXlsxEditProtection(zipBytes);
}

async function stripXlsxEditProtection(zipBytes) {
  const zip = await JSZip.loadAsync(zipBytes);
  const targets = Object.keys(zip.files).filter(
    (p) => p === 'xl/workbook.xml' || /^xl\/worksheets\/.*\.xml$/.test(p)
  );

  for (const path of targets) {
    let xml = await zip.file(path).async('string');
    xml = xml
      .replace(/<sheetProtection[^>]*\/>/g, '')
      .replace(/<workbookProtection[^>]*\/>/g, '');
    zip.file(path, xml);
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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
        const result = await processFile(selectedFiles[i], password, i, selectedFiles.length);
        processedBlobs.push(result);
      } catch (err) {
        console.error(err);
        updateFileStatus(i, 'Falhou', true);
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
      processedFileName = 'arquivos_sem_senha.zip';
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
