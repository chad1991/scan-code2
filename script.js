// =========================
// Barcode Scanner Logsheet
// =========================

let currentStream = null;
let usingBackCamera = true;
let scanMode = localStorage.getItem("scanMode") || "all";

let entries = JSON.parse(localStorage.getItem("entries") || "[]");
let batches = JSON.parse(localStorage.getItem("batches") || "[]");

const video = document.getElementById("cameraPreview");
const beepSuccess = document.getElementById("beepSuccess");
const beepError = document.getElementById("beepError");
const entriesList = document.getElementById("entriesList");
const batchesList = document.getElementById("batchesList");

// =========================
// Scanner Functions
// =========================
async function startScanner() {
  stopScanner();

  try {
    const constraints = {
      video: {
        facingMode: usingBackCamera ? "environment" : "user"
      }
    };

    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    if (scanMode === "1d" || scanMode === "all") initQuagga();
    if (scanMode === "2d" || scanMode === "all") initZXing();
  } catch (err) {
    console.error("Camera error:", err);
    alert("⚠️ Camera access failed: " + err.message);
  }
}

function stopScanner() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (Quagga.initialized) {
    Quagga.stop();
    Quagga.initialized = false;
  }
  if (zxingReader) {
    clearInterval(zxingReader.interval);
    zxingReader = null;
  }
}

function toggleCamera() {
  usingBackCamera = !usingBackCamera;
  startScanner();
}

function switchMode(mode) {
  scanMode = mode;
  localStorage.setItem("scanMode", mode);
  startScanner();
}

// =========================
// Quagga (1D barcodes)
// =========================
function initQuagga() {
  if (Quagga.initialized) return;
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: video
    },
    decoder: {
      readers: ["code_128_reader", "ean_reader", "ean_8_reader", "code_39_reader", "upc_reader"]
    }
  }, err => {
    if (err) return console.error(err);
    Quagga.start();
    Quagga.initialized = true;
  });

  Quagga.onDetected(res => {
    if (res && res.codeResult && res.codeResult.code) {
      processCode(res.codeResult.code);
    }
  });
}

// =========================
// ZXing (QR / 2D)
// =========================
let zxingReader = null;

function initZXing() {
  if (zxingReader) return;
  const codeReader = new ZXing.BrowserMultiFormatReader();
  zxingReader = codeReader;

  zxingReader.interval = setInterval(async () => {
    if (!video || video.readyState !== 4) return;
    try {
      const result = await codeReader.decodeFromVideoElement(video);
      if (result) processCode(result.text);
    } catch {}
  }, 500);
}

// =========================
// Process Scan
// =========================
function processCode(code) {
  // Prevent duplicate rapid scans
  if (entries.length > 0 && entries[entries.length - 1].code === code) return;

  beepSuccess.play();
  document.getElementById("result").innerText = "✅ " + code;

  addEntry({ code, qty: 1, price: 0 });
}

// =========================
// Data Management
// =========================
function addEntry(entry) {
  entries.push(entry);
  saveEntries();
  renderEntries();
}

function addManualEntry() {
  const code = document.getElementById("manualBarcode").value.trim();
  const qty = parseInt(document.getElementById("manualQty").value) || 1;
  const price = parseFloat(document.getElementById("manualPrice").value) || 0;

  if (!code) {
    beepError.play();
    alert("Enter a barcode first!");
    return;
  }

  addEntry({ code, qty, price });

  document.getElementById("manualBarcode").value = "";
  document.getElementById("manualQty").value = "1";
  document.getElementById("manualPrice").value = "";
}

function renderEntries() {
  entriesList.innerHTML = "";
  entries.forEach((e, i) => {
    const li = document.createElement("li");
    li.textContent = `${e.code} | Qty: ${e.qty} | Price: ${e.price}`;
    li.onclick = () => {
      if (confirm("Remove this entry?")) {
        entries.splice(i, 1);
        saveEntries();
        renderEntries();
      }
    };
    entriesList.appendChild(li);
  });
}

function renderBatches() {
  batchesList.innerHTML = "";
  batches.forEach((batch, i) => {
    const li = document.createElement("li");
    li.textContent = `Batch ${i + 1} (${batch.length} items)`;
    const btn = document.createElement("button");
    btn.textContent = "Restore";
    btn.onclick = () => {
      entries = batch;
      saveEntries();
      renderEntries();
    };
    li.appendChild(btn);
    batchesList.appendChild(li);
  });
}

function saveEntries() {
  localStorage.setItem("entries", JSON.stringify(entries));
}

function clearHistory() {
  if (!confirm("Clear all entries?")) return;
  entries = [];
  saveEntries();
  renderEntries();
}

// =========================
// Batch Handling
// =========================
function nextBatch() {
  if (entries.length === 0) {
    alert("⚠️ No entries to save.");
    return;
  }
  batches.push(entries);
  localStorage.setItem("batches", JSON.stringify(batches));
  entries = [];
  saveEntries();
  renderEntries();
  renderBatches();
}

// =========================
// Excel Export
// =========================
function downloadExcel() {
  if (entries.length === 0) {
    alert("⚠️ No entries to save.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(entries);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scans");

  XLSX.writeFile(wb, "barcode_logsheet.xlsx");
}

// =========================
// Header Storage
// =========================
function loadHeaderFromStorage() {
  const inputs = document.querySelectorAll("#headerInclude input, #headerInclude select");
  inputs.forEach(inp => {
    inp.value = localStorage.getItem("header_" + inp.id) || "";
    inp.addEventListener("change", () => {
      localStorage.setItem("header_" + inp.id, inp.value);
    });
  });
}

// =========================
// Init
// =========================
renderEntries();
renderBatches();
startScanner();
