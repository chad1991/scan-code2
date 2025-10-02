// ====== FORCE OPEN IN BROWSER ======
(function() {
  const ua = navigator.userAgent || navigator.vendor || "";
  if (ua.includes("FBAN") || ua.includes("FBAV") || ua.includes("Messenger")) {
    // Android: force Chrome, iOS: fallback to Safari
    if (/Android/i.test(ua)) {
      window.location = "intent://" + window.location.host + window.location.pathname + "#Intent;scheme=https;package=com.android.chrome;end";
    } else {
      window.location = window.location.href; // iOS reopens in Safari
    }
  }
})();

// ====== GLOBAL VARS ======
let currentStream = null;
let currentMode = "all"; // "1d", "2d", "all"
let usingFrontCamera = false;
let codeReader = null;

let entries = [];
let batches = [];

// ====== CAMERA & SCANNER ======
async function startScanner() {
  stopScanner();

  const constraints = {
    video: { facingMode: usingFrontCamera ? "user" : "environment" }
  };

  try {
    const video = document.getElementById("cameraPreview");
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    // 1D (Quagga)
    if (currentMode === "1d" || currentMode === "all") {
      Quagga.init({
        inputStream: {
          type: "LiveStream",
          target: video,
          constraints: constraints
        },
        decoder: {
          readers: ["ean_reader", "code128_reader", "upc_reader"]
        }
      }, err => {
        if (err) {
          console.error("Quagga init error:", err);
          return;
        }
        Quagga.start();
      });

      Quagga.onDetected(res => {
        if (res && res.codeResult && res.codeResult.code) {
          handleScan(res.codeResult.code);
        }
      });
    }

    // 2D (ZXing)
    if (currentMode === "2d" || currentMode === "all") {
      codeReader = new ZXing.BrowserMultiFormatReader();
      codeReader.decodeFromVideoDevice(null, "cameraPreview", (res, err) => {
        if (res) handleScan(res.text);
      });
    }
  } catch (err) {
    console.error("Camera error:", err);
    alert("❌ Camera not accessible. Please allow permission and try again.");
  }
}

function stopScanner() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (Quagga) Quagga.stop();
  if (codeReader) {
    codeReader.reset();
    codeReader = null;
  }
}

function toggleCamera() {
  usingFrontCamera = !usingFrontCamera;
  startScanner();
}

function switchMode(mode) {
  currentMode = mode;
  startScanner();
}

// ====== ENTRIES ======
function handleScan(code) {
  document.getElementById("beepSuccess").play();
  document.getElementById("result").textContent = "Scanned: " + code;

  let existing = entries.find(e => e.barcode === code);
  if (existing) {
    existing.qty += 1;
  } else {
    entries.push({ barcode: code, qty: 1, price: 0 });
  }
  renderEntries();
}

function renderEntries() {
  const ul = document.getElementById("entriesList");
  ul.innerHTML = "";
  entries.forEach((e, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${e.barcode}</span>
      Qty: <input type="number" value="${e.qty}" min="1" onchange="updateEntry(${idx}, 'qty', this.value)">
      Price: <input type="number" value="${e.price}" step="0.01" onchange="updateEntry(${idx}, 'price', this.value)">
      <button onclick="deleteEntry(${idx})">❌</button>
    `;
    ul.appendChild(li);
  });
}

function updateEntry(i, field, val) {
  entries[i][field] = parseFloat(val);
}

function deleteEntry(i) {
  entries.splice(i, 1);
  renderEntries();
}

function addManualEntry() {
  const b = document.getElementById("manualBarcode").value.trim();
  const q = parseInt(document.getElementById("manualQty").value);
  const p = parseFloat(document.getElementById("manualPrice").value) || 0;
  if (!b) return;

  let existing = entries.find(e => e.barcode === b);
  if (existing) {
    existing.qty += q;
    existing.price = p;
  } else {
    entries.push({ barcode: b, qty: q, price: p });
  }
  renderEntries();

  document.getElementById("manualBarcode").value = "";
  document.getElementById("manualQty").value = 1;
  document.getElementById("manualPrice").value = "";
}

// ====== BATCHES ======
function nextBatch() {
  if (entries.length === 0) return;

  const header = {
    date: document.getElementById("logDate").value,
    store: document.getElementById("storeName").value,
    discount: document.getElementById("discount").value
  };
  batches.push({ header, items: [...entries] });

  entries = [];
  renderEntries();
  renderBatches();
}

function renderBatches() {
  const ul = document.getElementById("batchesList");
  ul.innerHTML = "";
  batches.forEach((b, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      Batch ${idx+1} - ${b.header.store || "No Store"}
      <div>
        <button class="view" onclick="viewBatch(${idx})">View</button>
        <button class="delete" onclick="deleteBatch(${idx})">Delete</button>
      </div>
    `;
    ul.appendChild(li);
  });
}

function viewBatch(i) {
  const b = batches[i];
  document.getElementById("modalTitle").textContent = `Batch ${i+1}`;
  document.getElementById("modalHeader").textContent =
    `Date: ${b.header.date}, Store: ${b.header.store}, Discount: ${b.header.discount}%`;

  const tbody = document.getElementById("modalTableBody");
  tbody.innerHTML = "";
  b.items.forEach(it => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${it.barcode}</td><td>${it.qty}</td><td>${it.price}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("batchModal").style.display = "flex";
}

function deleteBatch(i) {
  batches.splice(i, 1);
  renderBatches();
}

function closeModal() {
  document.getElementById("batchModal").style.display = "none";
}

function clearHistory() {
  if (confirm("Clear all entries and batches?")) {
    entries = [];
    batches = [];
    renderEntries();
    renderBatches();
  }
}

// ====== EXPORT ======
function downloadExcel() {
  if (batches.length === 0) return;

  const wb = XLSX.utils.book_new();

  batches.forEach((b, idx) => {
    let data = [["Barcode", "Qty", "Price"]];
    b.items.forEach(it => data.push([it.barcode, it.qty, it.price]));
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `Batch${idx+1}`);
  });

  XLSX.writeFile(wb, "batches.xlsx");
}

// ====== START ======
startScanner();
