let currentStream = null;
let usingBackCamera = true;
let scanMode = localStorage.getItem("scanMode") || "all";

let entries = [];
let batches = JSON.parse(localStorage.getItem("batches")) || [];

function startScanner() {
  stopScanner();

  const constraints = {
    video: { facingMode: usingBackCamera ? "environment" : "user" }
  };

  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    currentStream = stream;
    document.getElementById("cameraPreview").srcObject = stream;
  });

  console.log("Scanner started in mode:", scanMode);
}

function stopScanner() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
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

function beep(success = true) {
  (success ? document.getElementById("beepSuccess") : document.getElementById("beepError")).play();
}

function addEntry(barcode, qty = 1, price = 0) {
  const existing = entries.find(e => e.barcode === barcode);
  if (existing) {
    existing.qty += qty;
    beep(true);
  } else {
    entries.push({ barcode, qty, price });
    beep(true);
  }
  renderEntries();
}

function addManualEntry() {
  const barcode = document.getElementById("manualBarcode").value.trim();
  const qty = parseInt(document.getElementById("manualQty").value) || 1;
  const price = parseFloat(document.getElementById("manualPrice").value) || 0;
  if (!barcode) return;
  addEntry(barcode, qty, price);
  document.getElementById("manualBarcode").value = "";
  document.getElementById("manualQty").value = 1;
  document.getElementById("manualPrice").value = "";
}

function renderEntries() {
  const list = document.getElementById("entriesList");
  list.innerHTML = "";
  entries.forEach((e, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${e.barcode}</span>
      Qty: <input type="number" value="${e.qty}" min="1" onchange="updateEntry(${i}, 'qty', this.value)">
      Price: <input type="number" value="${e.price}" step="0.01" onchange="updateEntry(${i}, 'price', this.value)">
    `;
    list.appendChild(li);
  });
}

function updateEntry(index, field, value) {
  if (field === "qty") entries[index].qty = parseInt(value) || 1;
  if (field === "price") entries[index].price = parseFloat(value) || 0;
}

function nextBatch() {
  if (entries.length === 0) return alert("No entries to save!");

  const batchHeader = {
    date: document.getElementById("logDate").value,
    store: document.getElementById("storeName").value,
    discount: document.getElementById("discount").value
  };

  batches.push({ header: batchHeader, entries: [...entries] });
  localStorage.setItem("batches", JSON.stringify(batches));

  renderBatches();
  entries = [];
  renderEntries();
}

function renderBatches() {
  const list = document.getElementById("batchesList");
  list.innerHTML = "";
  batches.forEach((b, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      Batch ${i + 1} - ${b.header.date || "No date"} (${b.entries.length} items)
      <button class="view" onclick="viewBatch(${i})">👁 View</button>
      <button class="delete" onclick="deleteBatch(${i})">❌ Delete</button>
    `;
    list.appendChild(li);
  });
}

function viewBatch(index) {
  const batch = batches[index];
  document.getElementById("modalTitle").textContent = `Batch ${index + 1} Details`;
  document.getElementById("modalHeader").innerHTML =
    `Date: ${batch.header.date || "N/A"}<br>
     Store: ${batch.header.store || "N/A"}<br>
     Discount: ${batch.header.discount || 0}%`;

  const tbody = document.getElementById("modalTableBody");
  tbody.innerHTML = "";
  batch.entries.forEach(e => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${e.barcode}</td><td>${e.qty}</td><td>${e.price}</td>`;
    tbody.appendChild(row);
  });

  document.getElementById("batchModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("batchModal").style.display = "none";
}

function deleteBatch(index) {
  if (!confirm("Delete this batch permanently?")) return;
  batches.splice(index, 1);
  localStorage.setItem("batches", JSON.stringify(batches));
  renderBatches();
}

function downloadExcel() {
  if (batches.length === 0) return alert("No batches to export!");

  const wb = XLSX.utils.book_new();

  batches.forEach((batch, i) => {
    const data = [["Barcode", "Qty", "Price"]];
    batch.entries.forEach(e => data.push([e.barcode, e.qty, e.price]));
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `Batch_${i + 1}`);
  });

  XLSX.writeFile(wb, "batches.xlsx");
}

function clearHistory() {
  if (!confirm("⚠️ This will permanently clear all batches. Continue?")) return;
  entries = [];
  batches = [];
  localStorage.removeItem("batches");
  renderEntries();
  renderBatches();
}

// Restore batches on load
renderBatches();
startScanner();
