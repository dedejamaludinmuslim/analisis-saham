// app.js
(function () {
  const { createClient } = supabase;

  // GANTI dengan URL & ANON KEY proyek kamu
  const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Konstanta strategi
  const TP_PCT = 0.10;   // +10% = zona TP 50%
  const CUT_PCT = -0.05; // -5% dari ENTRY = cut loss
  const TS1_PCT = 0.05;  // TS1 = -5% dari HIGH
  const TS2_PCT = 0.10;  // TS2 = -10% dari HIGH

  // DOM
  const kodeEl = document.getElementById("kode");
  const entryPriceEl = document.getElementById("entry_price");
  const lastPriceEl = document.getElementById("last_price");

  const btnSave = document.getElementById("btn-save");
  const btnReset = document.getElementById("btn-reset");
  const btnDelete = document.getElementById("btn-delete");

  const tbody = document.getElementById("table-body");
  const summaryRow = document.getElementById("summary-row");

  let currentId = null;    // id record yang sedang diedit
  let currentRows = [];    // cache data terbaru

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

    for (const row of currentRows) {
      const entry = parseNum(row.entry_price);
      const last = parseNum(row.last_price);
      if (!entry || !last) continue;

      const gainPct = (last - entry) / entry;
      totalGainVal += gainPct;
      countGain++;

      const cutLevel = entry * (1 + CUT_PCT);
      const tpLevel = entry * (1 + TP_PCT);

      if (last <= cutLevel) countCut++;
      if (last >= tpLevel) countTP++;
    }

    const avgGain = countGain ? totalGainVal / countGain : 0;

    summaryRow.innerHTML = `
      <div class="summary-item">Rata-rata Gain: <span>${formatPct(avgGain * 100)}</span></div>
      <div class="summary-item">Saham di zona TP (+10%): <span>${countTP}</span></div>
      <div class="summary-item">Kandidat Cut Loss (-5%): <span>${countCut}</span></div>
    `;
  }

  function renderTable() {
    tbody.innerHTML = "";

    for (const row of currentRows) {
      const entry = parseNum(row.entry_price);
      const last = parseNum(row.last_price);
      let high = parseNum(row.highest_price_after_entry);

      // fallback: kalau high belum ada, pakai entry
      if (!high && entry) high = entry;

      let gainPct = null;
      if (entry && last) gainPct = ((last - entry) / entry) * 100;

      const ts1 = high ? high * (1 - TS1_PCT) : null;
      const ts2 = high ? high * (1 - TS2_PCT) : null;
      const cutLevel = entry ? entry * (1 + CUT_PCT) : null;
      const tpLevel = entry ? entry * (1 + TP_PCT) : null;

      // Sinyal utama sederhana
      let signalText = "HOLD";
      let signalType = "hold";

      if (entry && last) {
        if (last <= cutLevel) {
          signalText = "CUT LOSS -5% Entry";
          signalType = "loss";
        } else if (last >= tpLevel) {
          signalText = "Zona TP +10%";
          signalType = "tp";
        } else if (gainPct > 0) {
          signalText = "PROFIT RUN";
          signalType = "profit";
        } else {
          signalText = "HOLD";
          signalType = "hold";
        }
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.kode}</td>
        <td>${formatNum(entry)}</td>
        <td>${formatNum(high)}</td>
        <td>${formatNum(last)}</td>
        <td>${formatPct(gainPct)}</td>
        <td>${ts1 ? formatNum(ts1) : "-"}</td>
        <td>${ts2 ? formatNum(ts2) : "-"}</td>
        <td>${formatPill(signalText, signalType)}</td>
      `;

      tr.addEventListener("click", () => fillForm(row));
      tbody.appendChild(tr);
    }
  }

  function fillForm(row) {
    currentId = row.id;
    kodeEl.value = row.kode || "";
    entryPriceEl.value = row.entry_price || "";
    lastPriceEl.value = row.last_price || "";
  }

  function resetForm() {
    currentId = null;
    kodeEl.value = "";
    entryPriceEl.value = "";
    lastPriceEl.value = "";
  }

  async function saveData() {
    const kode = (kodeEl.value || "").trim().toUpperCase();
    const entryPrice = parseNum(entryPriceEl.value);
    const lastPrice = parseNum(lastPriceEl.value);

    if (!kode || !entryPrice) {
      alert("Minimal isi Kode Saham dan Entry Price.");
      return;
    }

    // Cari high lama (kalau record sudah ada)
    let oldHigh = null;
    if (currentId) {
      const oldRow = currentRows.find(r => r.id === currentId);
      if (oldRow) oldHigh = parseNum(oldRow.highest_price_after_entry);
    }

    let highest = oldHigh || entryPrice;
    if (lastPrice && lastPrice > highest) {
      highest = lastPrice; // high auto update
    }

    const payload = {
      kode,
      entry_price: entryPrice,
      last_price: lastPrice,
      highest_price_after_entry: highest
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
      // record baru: kalau lastPrice kosong, high = entry
      if (!lastPrice) {
        payload.highest_price_after_entry = entryPrice;
      }
      result = await db
        .from("portofolio_saham")
        .insert(payload)
        .select()
        .single();
    }

    const { error } = result;
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

  // Init
  loadData();
})();