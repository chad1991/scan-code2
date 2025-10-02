/******************************
  Full script.js — merged & fixed
******************************/

// State
let entries = JSON.parse(localStorage.getItem('entries') || '[]'); // { code, qty, price }
let batches = JSON.parse(localStorage.getItem('batches') || '[]'); // { id, date, store, discount, items }
let currentBatchId = (batches.length > 0) ? (Math.max(...batches.map(b=>b.id)) + 1) : 1;

let zxingReader = null;
let quaggaRunning = false;
let zxingRunning = false;
let usingBackCamera = true;
let lastScanned = "";
let scanMode = localStorage.getItem('scanMode') || 'all';

// DOM refs
const videoEl = document.getElementById('cameraPreview');
const beepOk = document.getElementById('beepSuccess');
const beepErr = document.getElementById('beepError');

// --------------------
// Utilities
// --------------------
function saveState() {
  localStorage.setItem('entries', JSON.stringify(entries));
  localStorage.setItem('batches', JSON.stringify(batches));
}

function restoreHeader() {
  // load saved header values into inputs and add change listeners
  ['logDate','storeName','discount'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = localStorage.getItem('header_'+id) || el.value || '';
    el.addEventListener('change', () => {
      localStorage.setItem('header_'+id, el.value);
    });
  });
}

// --------------------
// Scanner control
// --------------------
async function startScanner() {
  stopScanner(); // ensure clean start

  scanMode = localStorage.getItem('scanMode') || document.getElementById('scanModeSelect').value || 'all';
  document.getElementById('scanModeSelect').value = scanMode;

  // Use ZXing (single library) for 2D or "all" mode to avoid conflicts.
  if (scanMode === '2d' || scanMode === 'all') {
    // ZXing will handle both 2D and 1D in 'all'
    startZXing();
    return;
  }

  // If 1d selected -> use Quagga
  if (scanMode === '1d') {
    startQuagga();
    return;
  }
}

function stopScanner() {
  // Stop Quagga if running
  try {
    if (quaggaRunning && window.Quagga) {
      Quagga.offDetected(onQuaggaDetected);
      Quagga.stop();
    }
  } catch (e) {
    console.warn('Quagga stop error', e);
  }
  quaggaRunning = false;

  // Stop ZXing if running
  try {
    if (zxingRunning && zxingReader) {
      try { zxingReader.reset(); } catch(e){/*ignore*/} // stops camera & decode
    }
  } catch (e) {
    console.warn('ZXing stop error', e);
  }
  zxingReader = null;
  zxingRunning = false;

  // Clear last scanned lock
  lastScanned = "";
  setResult('Stopped');
}

function toggleCamera(){
  usingBackCamera = !usingBackCamera;
  // restart scanner so change takes effect
  startScanner();
}

function switchMode(mode){
  scanMode = mode;
  localStorage.setItem('scanMode', mode);
  startScanner();
}

// --------------------
// Quagga (1D)
// --------------------
function startQuagga() {
  if (!window.Quagga) {
    alert('Quagga not loaded');
    return;
  }

  // ensure ZXing stopped
  if (zxingRunning && zxingReader) {
    try { zxingReader.reset(); } catch(e) {}
    zxingReader = null;
    zxingRunning = false;
  }

  Quagga.init({
    inputStream: {
      type: "LiveStream",
      target: videoEl,
      constraints: {
        facingMode: usingBackCamera ? 'environment' : 'user'
      }
    },
    decoder: {
      readers: ["ean_reader","ean_13_reader","code_128_reader","code_39_reader","upc_reader","upc_e_reader"]
    },
    numOfWorkers: navigator.hardwareConcurrency ? Math.max(1, navigator.hardwareConcurrency - 1) : 2
  }, function(err) {
    if (err) {
      console.error('Quagga init error', err);
      setResult('Camera error: ' + (err.message || err));
      return;
    }
    Quagga.start();
    quaggaRunning = true;
    Quagga.onDetected(onQuaggaDetected);
    setResult('Scanning (1D)');
  });
}

function onQuaggaDetected(result) {
  if (!result || !result.codeResult) return;
  const code = result.codeResult.code;
  handleDetectedCode(code);
}

// --------------------
// ZXing (2D and all)
// --------------------
function startZXing() {
  // ensure Quagga stopped
  try { if (quaggaRunning && window.Quagga) { Quagga.offDetected(onQuaggaDetected); Quagga.stop(); } } catch(e){}

  // create new reader
  zxingReader = new ZXing.BrowserMultiFormatReader();

  const constraints = {
    video: {
      facingMode: usingBackCamera ? 'environment' : 'user'
    }
  };

  // decodeFromVideoDevice chooses a camera and binds stream to provided video element
  zxingReader.decodeFromVideoDevice(undefined, videoEl, (result, err) => {
    if (result) {
      handleDetectedCode(result.text);
    }
    // ignore err; ZXing will repeatedly call with null err during streaming
  });

  zxingRunning = true;
  setResult('Scanning (2D/all)');
}

// --------------------
// Detection handling (common)
// --------------------
function handleDetectedCode(code) {
  if (!code) return;

  // Debounce / prevent rapid duplicates
  if (code === lastScanned) return;
  lastScanned = code;
  setTimeout(()=> lastScanned = "", 900); // allow after 900ms

  beepOk.play();
  setResult('✅ ' + code);

  // add or update entry (auto-add quantity)
  addOrUpdateEntry(code);
}

function setResult(text) {
  const el = document.getElementById('result');
  if (el) el.innerText = text;
}

// --------------------
// Entries / Manual
// --------------------
function addOrUpdateEntry(code, qty = 1, price = 0) {
  const idx = entries.findIndex(e => e.code === code);
  if (idx >= 0) {
    entries[idx].qty = Number(entries[idx].qty) + Number(qty);
    if (price !== 0) entries[idx].price = Number(price);
  } else {
    entries.push({ code: String(code), qty: Number(qty), price: Number(price) });
  }
  saveAndRender();
}

function addManual(){
  const code = document.getElementById('manualBarcode').value.trim();
  const qty = Number(document.getElementById('manualQty').value) || 1;
  const price = Number(document.getElementById('manualPrice').value) || 0;
  if (!code) { beepErr.play(); alert('Enter a barcode'); return; }
  addOrUpdateEntry(code, qty, price);

  // clear manual fields
  document.getElementById('manualBarcode').value = '';
  document.getElementById('manualQty').value = '1';
  document.getElementById('manualPrice').value = '';
}

function updateEntryField(index, field, value) {
  if (!entries[index]) return;
  if (field === 'qty') entries[index].qty = Number(value) || 1;
  if (field === 'price') entries[index].price = Number(value) || 0;
  saveAndRender();
}

function removeEntry(index) {
  if (!entries[index]) return;
  if (!confirm('Remove this entry?')) return;
  entries.splice(index,1);
  saveAndRender();
}

function saveAndRender(){
  saveState();
  renderEntries();
  renderBatches(); // keep batches panel updated (they come from storage)
}

// --------------------
// Rendering
// --------------------
function renderEntries(){
  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = '';
  entries.forEach((e,i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="max-width:260px;word-break:break-all">${escapeHtml(e.code)}</td>
      <td><input type="number" min="1" value="${e.qty}" onchange="updateEntryField(${i}, 'qty', this.value)" style="width:80px"></td>
      <td><input type="number" min="0" step="0.01" value="${Number(e.price).toFixed(2)}" onchange="updateEntryField(${i}, 'price', this.value)" style="width:100px"></td>
      <td>
        <button class="small-btn muted" onclick="copyCode(${i})">Copy</button>
        <button class="small-btn danger" onclick="removeEntry(${i})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function copyCode(index){
  const e = entries[index];
  if (!e) return;
  navigator.clipboard?.writeText(e.code).then(()=> {
    setResult('Copied ' + e.code);
  }).catch(()=> setResult('Copied failed'));
}

function renderBatches(){
  const ul = document.getElementById('batchesList');
  ul.innerHTML = '';
  batches.forEach(b => {
    const li = document.createElement('li');
    li.innerHTML = `<div>
        <strong>Batch ${b.id}</strong> &nbsp; ${b.store} &nbsp; (${b.date}) &nbsp; [${b.items.length} items]
      </div>
      <div>
        <button class="small-btn primary" onclick="exportBatch(${b.id})">Export</button>
        <button class="small-btn muted" onclick="restoreBatch(${b.id})">Restore</button>
        <button class="small-btn danger" onclick="deleteBatch(${b.id})">Delete</button>
      </div>`;
    ul.appendChild(li);
  });
}

// --------------------
// Batches
// --------------------
function nextBatch(){
  if (!entries || entries.length === 0) { alert('No entries to move to batch'); return; }

  const date = document.getElementById('logDate')?.value || new Date().toISOString().split('T')[0];
  const store = document.getElementById('storeName')?.value || 'Store';
  const discount = document.getElementById('discount')?.value || '0';

  const batch = { id: currentBatchId++, date, store, discount, items: JSON.parse(JSON.stringify(entries)) };
  batches.push(batch);

  // save
  saveState();
  localStorage.setItem('batches', JSON.stringify(batches));

  // auto-export this batch to excel
  exportBatch(batch.id);

  // clear current entries for next batch
  entries = [];
  saveAndRender();
  renderBatches();
}

function exportBatch(id){
  const b = batches.find(x => x.id === id);
  if (!b) { alert('Batch not found'); return; }
  downloadExcelForBatch(b);
}

function restoreBatch(id){
  const b = batches.find(x => x.id === id);
  if (!b) return;
  if (!confirm(`Restore batch ${id} and replace current entries?`)) return;
  entries = JSON.parse(JSON.stringify(b.items || []));
  saveAndRender();
}

function deleteBatch(id){
  if (!confirm('Delete batch permanently?')) return;
  batches = batches.filter(b => b.id !== id);
  localStorage.setItem('batches', JSON.stringify(batches));
  renderBatches();
}

// --------------------
// Excel Export
// --------------------
function downloadExcel(){ // exports current entries (not batch)
  if (!entries || entries.length === 0) { alert('No entries to export'); return; }
  const header = {
    date: document.getElementById('logDate')?.value || new Date().toISOString().split('T')[0],
    store: document.getElementById('storeName')?.value || 'Store',
    discount: document.getElementById('discount')?.value || '0'
  };
  const pseudoBatch = { id: 'current', date: header.date, store: header.store, discount: header.discount, items: entries };
  downloadExcelForBatch(pseudoBatch);
}

function downloadExcelForBatch(batchObj){
  const headerData = [
    { Field: 'Date', Value: batchObj.date },
    { Field: 'Store', Value: batchObj.store },
    { Field: 'Discount (%)', Value: batchObj.discount }
  ];

  // Use entries -> convert to clean array of objects
  const rows = (batchObj.items || []).map(it => ({ code: it.code, qty: it.qty, price: it.price }));

  // create sheet: header at A1, rows starting at A5
  const ws = XLSX.utils.json_to_sheet(headerData, { origin: "A1" });
  XLSX.utils.sheet_add_json(ws, rows, { origin: "A5", skipHeader: false });

  // create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scans');

  // filename safe
  const safeStore = String(batchObj.store || 'Store').replace(/[^a-z0-9]/gi, '_').substring(0, 24) || 'Store';
  const safeDate = batchObj.date || new Date().toISOString().split('T')[0];
  const batchLabel = (batchObj.id === 'current') ? 'Current' : `Batch${batchObj.id}`;
  const filename = `${safeStore}_${safeDate}_${batchLabel}.xlsx`;

  XLSX.writeFile(wb, filename);
}

// --------------------
// Clear all (entries + batches + header) — careful
// --------------------
function clearAll(){
  if (!confirm('Clear all entries and batches from local storage?')) return;
  entries = []; batches = [];
  localStorage.removeItem('entries');
  localStorage.removeItem('batches');
  localStorage.removeItem('header_logDate');
  localStorage.removeItem('header_storeName');
  localStorage.removeItem('header_discount');
  saveState();
  renderEntries(); renderBatches();
  setResult('Cleared');
}

// --------------------
// Init on page load
// --------------------
window.addEventListener('load', () => {
  // restore localStorage state
  entries = JSON.parse(localStorage.getItem('entries') || '[]');
  batches = JSON.parse(localStorage.getItem('batches') || '[]');
  currentBatchId = (batches.length > 0) ? (Math.max(...batches.map(b=>b.id)) + 1) : 1;

  renderEntries();
  renderBatches();
  restoreHeader();

  // set initial scan mode and start scanner
  scanMode = localStorage.getItem('scanMode') || 'all';
  document.getElementById('scanModeSelect').value = scanMode;

  startScanner();
});

// --------------------
// Helpers
// --------------------
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

