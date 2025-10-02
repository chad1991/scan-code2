// ================== GLOBAL VARIABLES ==================
let currentBatch = 0;
let batches = [[]]; // array of batches
let scannerRunning = false;
let currentStream = null;
let usingZXing = false;
let selectedCamera = null;
let scanMode = "all"; // "1d", "2d", "all"

// ================== CAMERA / SCANNER ==================
async function startScanner() {
  stopScanner();
  const video = document.getElementById("cameraPreview");

  try {
    // Get available cameras
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === "videoinput");

    if (cameras.length === 0) {
      alert("No camera found.");
      return;
    }

    if (!selectedCamera) {
      selectedCamera = cameras[cameras.length - 1].deviceId; // default: back camera
    }

    // Setup stream
    const constraints = {
      video: { deviceId: { exact: selectedCamera } }
    };
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    // Init scanner
    if (scanMode === "1d") {
      usingZXing = false;
      initQuagga(video);
    } else if (scanMode === "2d") {
      usingZXing = true;
      initZXing(video);
    } else {
      // All: try both
      usingZXing = false;
      initQuagga(video);
      initZXing(video);
    }

    scannerRunning = true;
  } catch (err) {
    console.error("Camera start error:", err);
    alert("Camera error: " + err.message);
  }
}

function stopScanner() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (window.Quagga) {
    Quagga.stop();
  }
  scannerRunning = false;
}

function toggleCamera() {
  stopScanner();
  selectedCamera = null; // reset so it picks the other one
  startScanner();
}

function switchMode(mode) {
  scanMode = mode;
  startScanner();
}

// ================== QUAGGA (1D) ==================
function initQuagga(video) {
  Quagga.init({
    inputStream: {
      type: "LiveStream",
      target: video,
      constraints: { deviceId: selectedCamera }
    },
    decoder: {
      readers: ["code_128_reader","ean_reader","ean_8_reader","code_39_reader","upc_reader"]
    }
  }, err => {
    if (err) {
      console.error(err);
      return;
    }
    Quagga.start();
    Quagga.onDetected(res => {
      if (res && res.codeResult && res.codeResult.code) {
        handleScan(res.codeResult.code);
      }
    });
  });
}

// ================== ZXING (2D/QR) ==================
async function initZXing(video) {
  try {
    const codeReader = new ZXing.BrowserMultiFormatReader();
    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    if (devices.length > 0) {
      codeReader.decodeFromVideoDevice(selectedCamera, "cameraPreview", result => {
        if (result) handleScan(result.text);
      });
    }
  } catch (e) {
    console.error("ZXing init error:", e);
  }
}

// ================== FEEDBACK (BEEP + VIBRATION) ==================
function feedback() {
  try {
    // 🔔 Beep sound
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 600;
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);

    // 📳 Vibration
    if (navigator.vibrate) {
      navigator.vibrate(150);
    }
  } catch (e) {
    console.warn("Feedback error:", e);
  }
}

// ================== SCAN HANDLER ==================
function handleScan(code) {
  let batch = batches[currentBatch];
  let existing = batch.find(item => item.code === code);

  if (existing) {
    existing.qty += 1;
  } else {
    batch.push({ code: code, price: 0, qty: 1 });
  }

  document.getElementById("result").innerText = "Scanned: " + code;
  feedback();
  renderTable();
}

// ================== MANUAL ENTRY ==================
function addManualEntry() {
  let code = document.getElementById("manualBarcode").value.trim();
  let qty = parseInt(document.getElementById("manualQty").value);
  let price = parseFloat(document.getElementById("manualPrice").value);

  if (!code) return;

  let batch = batches[currentBatch];
  let existing = batch.find(item => item.code === code);
  if (existing) {
    existing.qty += qty;
    existing.price = price;
  } else {
    batch.push({ code, qty, price });
  }

  feedback();
  renderTable();
  document.getElementById("manualBarcode").value = "";
  document.getElementById("manualQty").value = 1;
  document.getElementById("manualPrice").value = "";
}

// ================== RENDER ENTRIES ==================
function renderTable() {
  let list = document.getElementById("entriesList");
  list.innerHTML = "";
  batches[currentBatch].forEach((item, i) => {
    let li = document.createElement("li");
    li.innerHTML = `
      ${item.code} 
      Qty: <input type="number" value="${item.qty}" min="1" onchange="updateQty(${i}, this.value)">
      Price: <input type="number" value="${item.price}" step="0.01" onchange="updatePrice(${i}, this.value)">
    `;
    list.appendChild(li);
  });
}

function updateQty(index, val) {
  batches[currentBatch][index].qty = parseInt(val);
}

function updatePrice(index, val) {
  batches[currentBatch][index].price = parseFloat(val);
}

// ================== BATCH MANAGEMENT ==================
function nextBatch() {
  if (batches[currentBatch].length === 0) {
    alert("Current batch is empty.");
    return;
  }
  currentBatch++;
  batches[currentBatch] = [];
  document.getElementById("entriesList").innerHTML = "";
  renderBatches();
}

function renderBatches() {
  let list = document.getElementById("batchesList");
  list.innerHTML = "";
  batches.forEach((batch, idx) => {
    if (batch.length === 0) return;
    let li = document.createElement("li");
    li.innerHTML = `
      Batch ${idx + 1} (${batch.length} items)
      <button class="view" onclick="viewBatch(${idx})">View</button>
      <button class="delete" onclick="deleteBatch(${idx})">Delete</button>
    `;
    list.appendChild(li);
  });
}

function viewBatch(idx) {
  let modal = document.getElementById("batchModal");
  document.getElementById("modalTitle").innerText = "Batch " + (idx + 1);
  document.getElementById("modalHeader").innerText =
    "Date: " + (document.getElementById("logDate").value || "N/A") +
    " | Store: " + (document.getElementById("storeName").value || "N/A") +
    " | Discount: " + document.getElementById("discount").value + "%";

  let tbody = document.getElementById("modalTableBody");
  tbody.innerHTML = "";
  batches[idx].forEach(item => {
    let tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.code}</td><td>${item.qty}</td><td>${item.price}</td>`;
    tbody.appendChild(tr);
  });

  modal.style.display = "flex";
}

function closeModal() {
  document.getElementById("batchModal").style.display = "none";
}

function deleteBatch(idx) {
  batches.splice(idx, 1);
  if (currentBatch >= batches.length) currentBatch = batches.length - 1;
  renderBatches();
}

// ================== SAVE TO EXCEL ==================
function downloadExcel() {
  let allData = [];
  batches.forEach((batch, idx) => {
    batch.forEach(item => {
      allData.push({
        Batch: idx + 1,
        Code: item.code,
        Qty: item.qty,
        Price: item.price,
        Date: document.getElementById("logDate").value,
        Store: document.getElementById("storeName").value,
        Discount: document.getElementById("discount").value
      });
    });
  });

  if (allData.length === 0) {
    alert("No data to save.");
    return;
  }

  let ws = XLSX.utils.json_to_sheet(allData);
  let wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Logsheet");
  XLSX.writeFile(wb, "logsheet.xlsx");
}

// ================== CLEAR ==================
function clearHistory() {
  if (confirm("Clear all data?")) {
    batches = [[]];
    currentBatch = 0;
    renderTable();
    renderBatches();
  }
}

// ================== FORCE OPEN IN CHROME ==================
if (navigator.userAgent.includes("FBAN") || navigator.userAgent.includes("FBAV")) {
  window.location.href = "googlechrome://" + window.location.href.replace(/^https?:\/\//, "");
}
