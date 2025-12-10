(function () {
  const { createClient } = supabase;

  const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TP_PCT = 0.10; // Zona Take Profit +10%
  const CUT_PCT = -0.05; // Cut Loss -5%
  const TS1_PCT = 0.05; // Trailing Stop 1 -5%
  const TS2_PCT = 0.10; // Trailing Stop 2 -10%

  const kodeEl = document.getElementById("kode");
  const lastPriceEl = document.getElementById("last_price");
  const btnSave = document.getElementById("btn-save");
  const btnAbout = document.getElementById("btn-about");
  const btnInstall = document.getElementById("btn-install");

  const summaryRow = document.getElementById("summary-row");
  const cardsContainer = document.getElementById("cards-container");

  const rightTitle = document.getElementById("right-title");
  const rightBadge = document.getElementById("right-badge");
  const dashboardContent = document.getElementById("dashboard-content");
  const aboutDashboard = document.getElementById("about-dashboard");

  let currentRows = [];
  let currentId = null;
  let deferredPrompt = null;

  // ===== PWA: REGISTER SERVICE WORKER =====
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("service-worker.js")
        .catch((err) => {
          console.warn("SW register gagal:", err);
        });
    });
  }

  // Cek kalau sudah jalan sebagai PWA -> hide tombol install
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone && btnInstall) {
    btnInstall.hidden = true;
  }

  // ===== PWA: HANDLE beforeinstallprompt & install button =====
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall && !isStandalone) {
      btnInstall.hidden = false;
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (btnInstall) btnInstall.hidden = true;
  });

  if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      console.log("User choice:", choiceResult.outcome);
      deferredPrompt = null;
      btnInstall.hidden = true;
    });
  }

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
    const sign = n > 0 ? "+" : (n < 0 ? "" : "");
    return sign + n.toFixed(2) + "%";
  }

  function classForGain(n) {
    if (n === null || Number.isNaN(n)) return "gain-zero";
    if (n > 0.05) return "gain-pos";
    if (n < -0.05) return "gain-neg";
    return "gain-zero";
  }

  // Update signalInfo function to handle re-entry and add-on
  function signalInfo(entry, last, high) {
    if (!entry || !last) {
      return { text: "DATA KURANG", className: "sig-hold", icon: "⚪" };
    }

    const gainPct = (last - entry) / entry;
    const cutLevel = entry * (1 + CUT_PCT);
    const tpLevel = entry * (1 + TP_PCT);

    // Check for Cut Loss
    if (last <= cutLevel) {
      return { text: "CUT LOSS -5%", className: "sig-cut", icon: "🛑" };
    }

    // Check for TP Zone
    if (last >= tpLevel) {
      return { text: "ZONA TP +10%", className: "sig-tp", icon: "🎯" };
    }

    // Check for Add-on (when the price continues to rise)
    if (last > entry) {
      return { text: "ADD-ON POSITION", className: "sig-run", icon: "🚀" };
    }

    // Check for Re-entry (when price dropped to trailing stop and rises again)
    if (last > high * (1 - TS1_PCT)) {
      return { text: "RE-ENTRY (after drop)", className: "sig-run", icon: "🔁" };
    }

    // Check for Profit Run
    if (gainPct > 0) {
      return { text: "PROFIT RUN", className: "sig-run", icon: "🚀" };
    }

    // Default: Hold
    return { text: "HOLD", className: "sig-hold", icon: "⏸️" };
  }

  async function loadData() {
    const { data, error } = await db
      .from("portofolio_saham")
      .select("id, kode, entry_price, highest_price_after_entry, last_price")
      .order("kode", { ascending: true });

    if (error) {
      console.error("Gagal load data:", error);
      summaryRow.innerHTML = `
        <div class="summary-chip">
          ❌ Error load: <strong>${error.message}</strong>
        </div>
      `;
      cardsContainer.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`;
      return;
    }

    currentRows = data || [];
    if (dashboardContent && dashboardContent.style.display !== "none") {
      renderDashboard();
    }
  }

  function renderDashboard() {
    if (!currentRows.length) {
      summaryRow.innerHTML = `
        <div class="summary-chip">
          ℹ️ <span>Belum ada data. Tambahkan minimal satu saham lewat panel kiri.</span>
        </div>
      `;
      cardsContainer.innerHTML = `<div class="empty-state">Belum ada data.</div>`;
      return;
    }

    let totalGain = 0;
    let countGain = 0;
    let countCut = 0;
    let countTP = 0;
    let countRun = 0;
    let countHold = 0;

    const cards = [];

    for (const row of currentRows) {
      const entry = parseNum(row.entry_price);
      const last = parseNum(row.last_price);
      let high = parseNum(row.highest_price_after_entry);

      if (!high && entry) high = entry;
      const gainPct = entry && last ? ((last - entry) / entry) * 100 : null;

      if (entry && last) {
        totalGain += (last - entry) / entry;
        countGain++;

        const cutLevel = entry * (1 + CUT_PCT);
        const tpLevel = entry * (1 + TP_PCT);

        if (last <= cutLevel) countCut++;
        else if (last >= tpLevel) countTP++;
        else if ((last - entry) / entry > 0) countRun++;
        else countHold++;
      }

      const ts1 = high ? high * (1 - TS1_PCT) : null;
      const ts2 = high ? high * (1 - TS2_PCT) : null;
      const sig = signalInfo(entry, last, high);

      cards.push({
        id: row.id,
        kode: row.kode,
        entry,
        last,
        high,
        gainPct,
        ts1,
        ts2,
        sig
      });
    }

    cards.sort((a, b) => {
      const ga = (a.gainPct === null || Number.isNaN(a.gainPct)) ? -Infinity : a.gainPct;
      const gb = (b.gainPct === null || Number.isNaN(b.gainPct)) ? -Infinity : b.gainPct;
      return gb - ga;
    });

    const avgGainPct = countGain ? (totalGain / countGain) * 100 : 0;

    summaryRow.innerHTML = `
      <div class="summary-chip">
        📦 <span>Total saham: <strong>${currentRows.length}</strong></span>
      </div>
      <div class="summary-chip">
        📈 <span>Average gain: <strong>${formatPct(avgGainPct)}</strong></span>
      </div>
      <div class="summary-chip">
        ⏸️ <span>Hold: <strong>${countHold}</strong></span>
      </div>
      <div class="summary-chip">
        🛑 <span>Cut loss -5%: <strong>${countCut}</strong></span>
      </div>
      <div class="summary-chip">
        🎯 <span>Zona TP +10%: <strong>${countTP}</strong></span></div>
      <div class="summary-chip">
        🚀 <span>Profit run: <strong>${countRun}</strong></span>
      </div>
    `;

    cardsContainer.innerHTML = `
      <div class="cards-grid">
        ${cards
          .map((c) => {
            const gainClass = classForGain(c.gainPct);
            return `
              <div class="stock-card" data-id="${c.id}">
                <div class="stock-main">
                  <div class="stock-code">${c.kode || "-"}</div>
                  <div class="signal-pill ${c.sig.className}">
                    <span>${c.sig.icon}</span>
                    <span>${c.sig.text}</span>
                  </div>
                  <div class="stock-gain ${gainClass}">
                    ${c.gainPct === null ? "-" : formatPct(c.gainPct)}
                  </div>
                </div>
                <div class="stock-rows">
                  <div>
                    <div class="row-label">ENTRY</div>
                    <div class="row-value">${formatNum(c.entry)}</div>
                  </div>
                  <div>
                    <div class="row-label">HIGH</div>
                    <div class="row-value">${formatNum(c.high)}</div>
                  </div>
                  <div>
                    <div class="row-label">LAST</div>
                    <div class="row-value">${formatNum(c.last)}</div>
                  </div>
                </div>
                <div class="ts-row">
                  <span class="ts1">TS1 -5%: ${c.ts1 ? formatNum(c.ts1) : "-"}</span>
                  <span class="ts2">TS2 -10%: ${c.ts2 ? formatNum(c.ts2) : "-"}</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function resetForm() {
    currentId = null;
    kodeEl.value = "";
    lastPriceEl.value = "";
  }

  async function saveData() {
    const kode = (kodeEl.value || "").trim().toUpperCase();
    const lastPrice = parseNum(lastPriceEl.value);

    if (!kode || !lastPrice) {
      alert("Isi Kode Saham dan Last Price dulu.");
      return;
    }

    if (currentId) {
      const row = currentRows.find((r) => r.id === currentId);
      if (!row) {
        currentId = null;
        return saveData();
      }

      const entry = parseNum(row.entry_price) || lastPrice;
      const oldHigh = parseNum(row.highest_price_after_entry) || entry;
      const newHigh = lastPrice > oldHigh ? lastPrice : oldHigh;

      const payloadUpdate = {
        kode,
        entry_price: entry,
        last_price: lastPrice,
        highest_price_after_entry: newHigh
      };

      const { error: updateError } = await db
        .from("portofolio_saham")
        .update(payloadUpdate)
        .eq("id", currentId);

      if (updateError) {
        console.error("Gagal update:", updateError);
        alert("Gagal update data: " + updateError.message);
        return;
      }

      resetForm();
      await loadData();
      return;
    }

    const { data: existing, error: queryError } = await db
      .from("portofolio_saham")
      .select("id, entry_price, highest_price_after_entry, last_price")
      .eq("kode", kode)
      .maybeSingle();

    if (queryError && queryError.code !== "PGRST116") {
      console.error("Gagal cek existing:", queryError);
      alert("Gagal cek data existing: " + queryError.message);
      return;
    }

    if (existing) {
      const entry = parseNum(existing.entry_price) || lastPrice;
      const oldHigh = parseNum(existing.highest_price_after_entry) || entry;
      const newHigh = lastPrice > oldHigh ? lastPrice : oldHigh;

      const payloadUpdate = {
        kode,
        entry_price: entry,
        last_price: lastPrice,
        highest_price_after_entry: newHigh
      };

      const { error: updateError } = await db
        .from("portofolio_saham")
        .update(payloadUpdate)
        .eq("id", existing.id);

      if (updateError) {
        console.error("Gagal update:", updateError);
        alert("Gagal update data: " + updateError.message);
        return;
      }
    } else {
      const payloadInsert = {
        kode,
        entry_price: lastPrice,
        last_price: lastPrice,
        highest_price_after_entry: lastPrice
      };

      const { error: insertError } = await db
        .from("portofolio_saham")
        .insert(payloadInsert);

      if (insertError) {
        console.error("Gagal insert:", insertError);
        alert("Gagal insert data: " + insertError.message);
        return;
      }
    }

    resetForm();
    await loadData();
  }

  function toggleAbout() {
    if (!dashboardContent || !aboutDashboard) return;

    const isDashboardVisible =
      dashboardContent.style.display === "" || dashboardContent.style.display === "block";

    if (isDashboardVisible) {
      dashboardContent.style.display = "none";
      aboutDashboard.style.display = "block";
      if (rightTitle) rightTitle.textContent = "Tentang Aplikasi";
      if (rightBadge) rightBadge.textContent = "Penjelasan fitur & cara pakai";
      if (btnAbout) btnAbout.textContent = "⬅️ Kembali";
    } else {
      aboutDashboard.style.display = "none";
      dashboardContent.style.display = "block";
      if (rightTitle) rightTitle.textContent = "Tren Semua Saham";
      if (rightBadge) rightBadge.textContent = "Sinyal: Cut • TP • Run • Hold";
      if (btnAbout) btnAbout.textContent = "ℹ️ Tentang";
      renderDashboard();
    }
  }

  btnSave.addEventListener("click", (e) => {
    e.preventDefault();
    saveData();
  });

  if (btnAbout) {
    btnAbout.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAbout();
    });
  }

  cardsContainer.addEventListener("click", (e) => {
    const card = e.target.closest(".stock-card");
    if (!card) return;

    const id = card.getAttribute("data-id");
    const row = currentRows.find((r) => r.id === id);
    if (!row) return;

    currentId = row.id;
    kodeEl.value = row.kode || "";
    lastPriceEl.value = row.last_price || "";
  });

  loadData();
})();