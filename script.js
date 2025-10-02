let entries = [];
let batches = [];
let currentBatch = 1;
let scannerRunning = false;
let usingBackCamera = true;
let scanMode = localStorage.getItem("scanMode") || "all";

// ========== Camera + Scanner ========== //
function startScanner() {
  stopScanner();
  scannerRunning = true;
  const video = document.getElementById("cameraPreview");

  if (scanMode === "1d" || scanMode === "all") {
    Quagga.init({
      inputStream: {
        type: "LiveStream",
        target: video,
        constraints: { facingMode: usingBackCamera ? "environment" : "user" }
      },
      decoder: {
        readers: ["code_128_reader","ean_reader","ean_8_reader","upc_reader","upc_e_reader"]
      }
    }, err => {
      if (err) { console.error(err); return; }
      Quagga.start();
    });

    Quagga.onDetected(data => handleScan(data.codeResult.code));
  }

  if (scanMode === "2d" || scanMode === "all") {
    const codeReader = new ZXing.BrowserMultiFormatReader();
    codeReader.decodeFromVideoDevice(usingBackCamera ? undefined : "user", video, (result, err) => {
      if (result) handleScan(result.text);
    });
  }
}

function stopScanner() {
  if (scannerRunning) {
    try { Quagga.stop(); } catch {}
    scannerRunning = false;
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

// ========== Handling Scans ========== //
function handleScan(code) {
  if (!code) return;
  const beep = document.getElementById("beepSuccess");
  beep.play();
  document.getElementById("result").innerText = `✅ Scanned: ${code}`;
  entries.push({ Barcode: code, Qty: 1, Price: 0 });
  renderEntries();
}

// ========== Manual Entry ========== //
function addManualEntry() {
  const barcode = document.getElementById("manualBarcode").value.trim();
  const qty = parseInt(document.getElementById("manualQty").value) || 1;
  const price = parseFloat(document.getElementById("manualPrice").value) || 0;

  if (!barcode) { alert("Enter a barcode"); return; }

  entries.push({ Barcode: barcode, Qty: qty, Price: price });
  renderEntries();

  document.getElementById("manualBarcode").value = "";
  document.getElementById("manualQty").value = "1";
  document.getElementById("manualPrice").value = "";
}

// ========== Render Entries ========== //
function renderEntries() {
  const list = document.getElementById("entriesList");
  list.innerHTML = "";
  entries.forEach((e, i) => {
    const li = document.createElement("li");
    li.textContent = `${e.Barcode} | Qty: ${e.Qty} | Price: ${e.Price}`;
    li.onclick = () => { if (confirm("Remove this item?")) { entries.splice(i, 1); renderEntries(); } };
    list.appendChild(li);
  });
}

// ========== Clear All ========== //
function clearHistory() {
  if (confirm("Clear all entries?")) {
    entries = [];
    renderEntries();
  }
}

// ========== Batching ========== //
function nextBatch() {
  if (entries.length === 0) {
    alert("⚠️ No entries to move to batch.");
    return;
  }

  // Save batch with header info
  const logDate = document.getElementById("logDate").value || new Date().toISOString().split("T")[0];
  const storeName = document.getElementById("storeName").value || "Store";
  const discount = document.getElementById("discount").value || "0";

  batches.push({ batch: currentBatch, date: logDate, store: storeName, discount, items: [...entries] });

  // Render batch list
  renderBatches();

  // Auto-export Excel for this batch
  downloadExcel(currentBatch);

  // Prepare next batch
  currentBatch++;
  entries = [];
  renderEntries();
}

function renderBatches() {
  const list = document.getElementById("batchesList");
  list.innerHTML = "";
  batches.forEach(b => {
    const li = document.createElement("li");
    li.textContent = `Batch ${b.batch} - ${b.store} (${b.date}) [${b.items.length} items]`;
    const btn = document.createElement("button");
    btn.textContent = "⬇ Export";
    btn.onclick = () => downloadExcel(b.batch);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// ========== Excel Export ========== //
function downloadExcel(batchNum = null) {
  let dataToSave, batchLabel;

  if (batchNum) {
    const batch = batches.find(b => b.batch === batchNum);
    if (!batch) return;
    dataToSave = batch.items;
    batchLabel = `Batch${batch.batch}`;
    var logDate = batch.date;
    var storeName = batch.store;
    var discount = batch.discount;
  } else {
    dataToSave = entries;
    batchLabel = `Batch${currentBatch}`;
    logDate = document.getElementById("logDate").value || new Date().toISOString().split("T")[0];
    storeName = document.getElementById("storeName").value || "Store";
    discount = document.getElementById("discount").value || "0";
  }

  if (dataToSave.length === 0) {
    alert("⚠️ No entries to save.");
    return;
  }

  const headerData = [
    { Field: "Date", Value: logDate },
    { Field: "Store", Value: storeName },
    { Field: "Discount (%)", Value: discount }
  ];

  const ws = XLSX.utils.json_to_sheet(headerData, { origin: "A1" });
  XLSX.utils.sheet_add_json(ws, dataToSave, { origin: "A5", skipHeader: false });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scans");

  let safeStore = storeName.replace(/[^a-z0-9]/gi, "_").substring(0, 20) || "Store";
  let safeDate = logDate || new Date().toISOString().split("T")[0];
  let filename = `${safeStore}_${safeDate}_${batchLabel}.xlsx`;

  XLSX.writeFile(wb, filename);
}

// Auto-start scanner
window.onload = () => {
  document.getElementById("scanModeSelect").value = scanMode;
  startScanner();
};
