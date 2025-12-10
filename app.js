// app.js
(function () {
  const { createClient } = supabase;

  const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TP_PCT = 0.10;
  const CUT_PCT = -0.05;
  const TS1_PCT = 0.05;
  const TS2_PCT = 0.10;

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

  /**
   * Sinyal:
   * - cut      -> CUT LOSS -5%
   * - reentry  -> RE-ENTRY ZONE
   * - tp       -> ZONA TP +10%
   * - run      -> PROFIT RUN
   * - hold     -> HOLD
   * - none     -> DATA KURANG
   */
  function signalInfo(entry, last, high) {
    if (!entry || !last) {
      return {
        type: "none",
        text: "DATA KURANG",
        className: "sig-hold",
        icon: "⚪",
      };
    }

    const gainPct = (last - entry) / entry;
    const cutLevel = entry * (1 + CUT_PCT);
    const tpLevel = entry * (1 + TP_PCT);

    const hasReachedTP = high && high >= tpLevel;
    const nearEntry =
      last >= entry * 0.98 && // sekitar -2% dari entry
      last <= entry * 1.03;   // sampai +3% dari entry

    // 1) Cut loss dulu, ini prioritas
    if (last <= cutLevel) {
      return {
        type: "cut",
        text: "CUT LOSS -5%",
        className: "sig-cut",
        icon: "🛑",
      };
    }

    // 2) Re-entry zone: pernah TP, sekarang balik ke sekitar entry
    if (hasReachedTP && nearEntry) {
      return {
        type: "reentry",
        text: "RE-ENTRY ZONE",
        className: "sig-reentry",
        icon: "🔁",
      };
    }

    // 3) Zona TP (harga saat ini masih ≥ TP)
    if (last >= tpLevel) {
      return {
        type: "tp",
        text: "ZONA TP +10%",
        className: "sig-tp",
        icon: "🎯",
      };
    }

    // 4) Profit run
    if (gainPct > 0) {
      return {
        type: "run",
        text: "PROFIT RUN",
        className: "sig-run",
        icon: "🚀",
      };
    }

    // 5) Sisanya: Hold
    return {
      type: "hold",
      text: "HOLD",
      className: "sig-hold",
      icon: "⏸️",
    };
  }

  async function loadData() {
    const { data, error } = await db
      .from("portofolio_saham")
      .select("id, kode, entry_price, highest_price_after_entry, last_price")
      .order("kode", { ascending: true });

    if (error) {
      console.error("Gagal load data:", error);
      summaryRow.innerHTML = `
        <div class="summary-line">
          <div class="summary-label">Error</div>
          <div class="summary-value">-</div>
          <div class="summary-action">Gagal memuat data: ${error.message}</div>
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
        <div class="summary-line">
          <div class="summary-label">Total saham</div>
          <div class="summary-value">0</div>
          <div class="summary-action">Belum ada posisi. Mulai catat saham yang ingin dipantau.</div>
        </div>
      `;
      cardsContainer.innerHTML = `<div class="empty-state">Belum ada data. Tambahkan minimal satu saham lewat panel kiri.</div>`;
      return;
    }

    let totalGain = 0;
    let countGain = 0;
    let countCut = 0;
    let countTP = 0;
    let countRun = 0;
    let countHold = 0;
    let countReEntry = 0;

    const cards = [];

    for (const row of currentRows) {
      const entry = parseNum(row.entry_price);
      const last = parseNum(row.last_price);
      let high = parseNum(row.highest_price_after_entry);

      if (!high && entry) high = entry;
      const gainPct = entry && last ? ((last - entry) / entry) * 100 : null;

      const sig = signalInfo(entry, last, high);

      if (entry && last) {
        totalGain += (last - entry) / entry;
        countGain++;

        switch (sig.type) {
          case "cut":
            countCut++;
            break;
          case "tp":
            countTP++;
            break;
          case "run":
            countRun++;
            break;
          case "reentry":
            countReEntry++;
            break;
          case "hold":
            countHold++;
            break;
          default:
            break;
        }
      }

      const ts1 = high ? high * (1 - TS1_PCT) : null;
      const ts2 = high ? high * (1 - TS2_PCT) : null;

      cards.push({
        id: row.id,
        kode: row.kode,
        entry,
        last,
        high,
        gainPct,
        ts1,
        ts2,
        sig,
      });
    }

    // Urutkan dari gain tertinggi ke terendah
    cards.sort((a, b) => {
      const ga = (a.gainPct === null || Number.isNaN(a.gainPct)) ? -Infinity : a.gainPct;
      const gb = (b.gainPct === null || Number.isNaN(b.gainPct)) ? -Infinity : b.gainPct;
      return gb - ga;
    });

    const avgGainPct = countGain ? (totalGain / countGain) * 100 : 0;

    // ===== PANEL STATISTIK + REKOMENDASI AKSI =====
    summaryRow.innerHTML = `
      <div class="summary-line">
        <div class="summary-label">Total saham</div>
        <div class="summary-value">${currentRows.length}</div>
        <div class="summary-action">Jaga portofolio tetap fokus, jangan terlalu banyak saham agar mudah dipantau.</div>
      </div>
      <div class="summary-line">
        <div class="summary-label">Average gain</div>
        <div class="summary-value">${formatPct(avgGainPct)}</div>
        <div class="summary-action">Bandingkan dengan target gain pribadi; evaluasi saham yang menyeret rata-rata turun.</div>
      </div>
      <div class="summary-line">
        <div class="summary-label">Zona TP +10%</div>
        <div class="summary-value">${countTP}</div>
        <div class="summary-action">Siapkan rencana partial sell (±30–50%) untuk saham di zona TP saat closing.</div>
      </div>
      <div class="summary-line">
        <div class="summary-label">Profit run</div>
        <div class="summary-value">${countRun}</div>
        <div class="summary-action">Tahan saham ini dan perketat trailing stop; biarkan profit berlari tapi tetap terjaga.</div>
      </div>
      <div class="summary-line">
        <div class="summary-label">Re-entry</div>
        <div class="summary-value">${countReEntry}</div>
        <div class="summary-action">Pertimbangkan entry ulang bertahap di zona ini, tetap disiplin dengan cut loss & ukuran lot.</div>
      </div>
      <div class="summary-line">
        <div class="summary-label">Hold</div>
        <div class="summary-value">${countHold}</div>
        <div class="summary-action">Belum ada sinyal aksi kuat; cukup pantau tren dan tunggu mendekati TP atau TS.</div>
      </div>
      <div class="summary-line">
        <div class="summary-label">Cut loss -5%</div>
        <div class="summary-value">${countCut}</div>
        <div class="summary-action">Disiplin cut loss di saham ini saat closing untuk menjaga kesehatan modal.</div>
      </div>
    `;

    // ===== KARTU SAHAM =====
    cardsContainer.innerHTML = `
      <div class="cards-grid">
        ${cards
          .map((c) => {
            const gainClass = classForGain(c.gainPct);
            return `
              <div class="stock-card" data-id="${c.id}">
                <div class="stock-main">
                  <div>
                    <div class="stock-code">${c.kode || "-"}</div>
                    <div class="signal-pill ${c.sig.className}">
                      <span>${c.sig.icon}</span>
                      <span>${c.sig.text}</span>
                    </div>
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
        highest_price_after_entry: newHigh,
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
        highest_price_after_entry: newHigh,
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
        highest_price_after_entry: lastPrice,
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
      if (rightBadge) rightBadge.textContent = "Sinyal: Cut • TP • Run • Hold • Re-entry";
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