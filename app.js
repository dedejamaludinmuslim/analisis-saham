// app.js
(function () {
  const { createClient } = supabase;

  // GANTI dengan URL & ANON KEY proyek kamu
  const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Konstanta strategi (bisa diubah)
  const TP_PCT = 0.10;   // +10% take profit (jual 50%)
  const CUT_PCT = -0.05; // -5% cut loss full
  const TS_PCT = 0.05;   // trailing stop 5% dari high

  // DOM
  const kodeEl = document.getElementById("kode");
  const entryDateEl = document.getElementById("entry_date");
  const entryPriceEl = document.getElementById("entry_price");
  const qtyEl = document.getElementById("qty");
  const partialPriceEl = document.getElementById("partial_price");
  const partialQtyEl = document.getElementById("partial_qty");
  const highestPriceEl = document.getElementById("highest_price");
  const lastPriceEl = document.getElementById("last_price");
  const catatanEl = document.getElementById("catatan");

  const btnSave = document.getElementById("btn-save");
  const btnReset = document.getElementById("btn-reset");
  const btnNewHigh = document.getElementById("btn-new-high");
  const btnDelete = document.getElementById("btn-delete");

  const tbody = document.getElementById("table-body");
  const summaryRow = document.getElementById("summary-row");

  let currentId = null; // id record yang sedang diedit
  let currentRows = []; // cache data

  function parseNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatNum(n, digit = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    return n.toFixed(digit);
  }

  function formatPct(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    const sign = n > 0 ? "+" : "";
    return sign + n.toFixed(2) + "%";
  }

  function formatPill(text, type) {
    const cls =
      type === "profit" ? "pill pill-profit" :
      type === "loss" ? "pill pill-loss" :
      type === "cut" ? "pill pill-cut" :
      type === "tp" ? "pill pill-tp" :
      "pill pill-hold";
    return `<span class="${cls}">${text}</span>`;
  }

  async function loadData() {
    const { data, error } = await db
      .from("portofolio_saham")
      .select("*")
      .order("kode", { ascending: true });

    if (error) {
      console.error("Gagal load data:", error);
      alert("Gagal memuat data portofolio.");
      return;
    }

    currentRows = data || [];
    renderTable();
    renderSummary();
  }

  function renderSummary() {
    if (!currentRows.length) {
      summaryRow.innerHTML = `<div class="summary-item">Belum ada data. Tambah dulu minimal 1 saham.</div>`;
      return;
    }

    let totalGainVal = 0;
    let countGain = 0;
    let countCut = 0;
    let countTP = 0;
    let countHold = 0;

    for (const row of currentRows) {
      const { entry_price, last_price, highest_price_after_entry, partial_sell_price } = row;
      const entry = parseNum(entry_price);
      const last = parseNum(last_price);

      if (!entry || !last) continue;

      const gainPct = (last - entry) / entry;
      totalGainVal += gainPct;
      countGain++;

      const cutLevel = entry * (1 + CUT_PCT);
      const tpLevel = entry * (1 + TP_PCT);
      const high = parseNum(highest_price_after_entry);
      const tsPrice = high ? high * (1 - TS_PCT) : null;

      let signal = "HOLD";
      if (last <= cutLevel) {
        signal = "CUT";
        countCut++;
      } else if (last >= tpLevel && !partial_sell_price) {
        signal = "TP";
        countTP++;
      } else {
        countHold++;
      }
    }

    const avgGain = countGain ? totalGainVal / countGain : 0;

    summaryRow.innerHTML = `
      <div class="summary-item">Rata-rata Gain: <span>${formatPct(avgGain * 100)}</span></div>
      <div class="summary-item">TP Sinyal: <span>${countTP}</span></div>
      <div class="summary-item">Cut Loss Sinyal: <span>${countCut}</span></div>
      <div class="summary-item">Hold: <span>${countHold}</span></div>
    `;
  }

  function renderTable() {
    tbody.innerHTML = "";

    for (const row of currentRows) {
      const entry = parseNum(row.entry_price);
      const last = parseNum(row.last_price);
      const high = parseNum(row.highest_price_after_entry);

      let gainPct = null;
      if (entry && last) gainPct = ((last - entry) / entry) * 100;

      const cutLevel = entry ? entry * (1 + CUT_PCT) : null;
      const tpLevel = entry ? entry * (1 + TP_PCT) : null;
      const tsPrice = high ? high * (1 - TS_PCT) : null;

      let signalText = "HOLD";
      let signalType = "hold";

      if (entry && last) {
        if (last <= cutLevel) {
          signalText = "CUT LOSS";
          signalType = "cut";
        } else if (last >= tpLevel && !row.partial_sell_price) {
          signalText = "TP 50%";
          signalType = "tp";
        } else if (tsPrice && last <= tsPrice && row.partial_sell_price) {
          signalText = "TS HIT (jual sisa)";
          signalType = "loss";
        } else if (gainPct > 0) {
          signalText = "PROFIT RUN";
          signalType = "profit";
        }
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.kode}</td>
        <td>${formatNum(entry)}</td>
        <td>${row.partial_sell_price ? formatNum(row.partial_sell_price) : "-"}</td>
        <td>${formatNum(high)}</td>
        <td>${formatNum(last)}</td>
        <td>${formatPct(gainPct)}</td>
        <td>${tsPrice ? formatNum(tsPrice) : "-"}</td>
        <td>${formatPill(signalText, signalType)}</td>
      `;

      tr.addEventListener("click", () => fillForm(row));
      tbody.appendChild(tr);
    }
  }

  function fillForm(row) {
    currentId = row.id;
    kodeEl.value = row.kode || "";
    entryDateEl.value = row.entry_date || "";
    entryPriceEl.value = row.entry_price || "";
    qtyEl.value = row.qty || "";
    partialPriceEl.value = row.partial_sell_price || "";
    partialQtyEl.value = row.partial_sell_qty || "";
    highestPriceEl.value = row.highest_price_after_entry || "";
    lastPriceEl.value = row.last_price || "";
    catatanEl.value = row.catatan || "";
  }

  function resetForm() {
    currentId = null;
    kodeEl.value = "";
    entryDateEl.value = "";
    entryPriceEl.value = "";
    qtyEl.value = "";
    partialPriceEl.value = "";
    partialQtyEl.value = "";
    highestPriceEl.value = "";
    lastPriceEl.value = "";
    catatanEl.value = "";
  }

  async function saveData() {
    const kode = (kodeEl.value || "").trim().toUpperCase();
    const entryDate = entryDateEl.value || null;
    const entryPrice = parseNum(entryPriceEl.value);
    const qty = parseNum(qtyEl.value);
    const partialPrice = parseNum(partialPriceEl.value);
    const partialQty = parseNum(partialQtyEl.value);
    const highestPrice = parseNum(highestPriceEl.value);
    const lastPrice = parseNum(lastPriceEl.value);
    const catatan = catatanEl.value || null;

    if (!kode || !entryPrice) {
      alert("Minimal isi Kode Saham dan Entry Price.");
      return;
    }

    const payload = {
      kode,
      entry_date: entryDate,
      entry_price: entryPrice,
      qty,
      partial_sell_price: partialPrice,
      partial_sell_qty: partialQty,
      highest_price_after_entry: highestPrice || entryPrice, // default high = entry kalau kosong
      last_price: lastPrice,
      catatan
    };

    let result;
    if (currentId) {
      result = await db
        .from("portofolio_saham")
        .update(payload)
        .eq("id", currentId)
        .select()
        .single();
    } else {
      result = await db
        .from("portofolio_saham")
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = result;
    if (error) {
      console.error("Gagal simpan:", error);
      alert("Gagal menyimpan data.");
      return;
    }

    resetForm();
    await loadData();
  }

  async function deleteData() {
    if (!currentId) {
      alert("Pilih dulu baris yang mau dihapus (klik baris di tabel).");
      return;
    }
    if (!confirm("Yakin ingin menghapus record ini?")) return;

    const { error } = await db
      .from("portofolio_saham")
      .delete()
      .eq("id", currentId);

    if (error) {
      console.error("Gagal hapus:", error);
      alert("Gagal menghapus data.");
      return;
    }
    resetForm();
    await loadData();
  }

  async function setHighestFromLast() {
    if (!currentId) {
      alert("Pilih dulu baris di tabel (klik), baru update highest.");
      return;
    }

    const row = currentRows.find(r => r.id === currentId);
    if (!row) return;

    const lastPrice = parseNum(lastPriceEl.value || row.last_price);
    if (!lastPrice) {
      alert("Last Price belum diisi.");
      return;
    }

    const { error } = await db
      .from("portofolio_saham")
      .update({ highest_price_after_entry: lastPrice })
      .eq("id", currentId);

    if (error) {
      console.error("Gagal update highest:", error);
      alert("Gagal update highest price.");
      return;
    }

    highestPriceEl.value = lastPrice;
    await loadData();
  }

  // Event listeners
  btnSave.addEventListener("click", (e) => {
    e.preventDefault();
    saveData();
  });

  btnReset.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm();
  });

  btnDelete.addEventListener("click", (e) => {
    e.preventDefault();
    deleteData();
  });

  btnNewHigh.addEventListener("click", (e) => {
    e.preventDefault();
    setHighestFromLast();
  });

  // Init
  loadData();
})();