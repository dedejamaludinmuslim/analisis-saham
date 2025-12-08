(function () {
  const { createClient } = supabase;

  const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ELEMENTS
  const kodeSahamInput = document.getElementById("kodeSahamInput");
  const closePriceInput = document.getElementById("closePriceInput");
  const closeDateInput = document.getElementById("closeDateInput");
  const btnSave = document.getElementById("btnSave");
  const inputMessage = document.getElementById("inputMessage");

  const kodeSahamFilter = document.getElementById("kodeSahamFilter");
  const btnLoadTrend = document.getElementById("btnLoadTrend");
  const trendList = document.getElementById("trendList");

  const btnAbout = document.getElementById("btnAbout");
  const aboutModal = document.getElementById("aboutModal");
  const aboutOverlay = document.getElementById("aboutOverlay");
  const btnAboutClose = document.getElementById("btnAboutClose");
  const btnAboutCloseBottom = document.getElementById("btnAboutCloseBottom");

  const dashboardList = document.getElementById("dashboardList");
  const btnReloadDashboard = document.getElementById("btnReloadDashboard");

  const btnExportCsv = document.getElementById("btnExportCsv");
  const catatanSaham = document.getElementById("catatanSaham");
  const btnSaveCatatan = document.getElementById("btnSaveCatatan");

  const ts1Input = document.getElementById("ts1Input");
  const ts2Input = document.getElementById("ts2Input");
  const ts3Input = document.getElementById("ts3Input");
  const btnSaveTSConfig = document.getElementById("btnSaveTSConfig");

  // ===== helper visual =====
  function getSignalBadge(signal) {
    let base =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold";

    switch (signal) {
      case "Exit All":
        return `${base} bg-red-500/15 text-red-400 border border-red-500/40`;
      case "Sell 50%":
        return `${base} bg-orange-500/15 text-orange-400 border border-orange-500/40`;
      case "Sell 30%":
        return `${base} bg-amber-500/15 text-amber-300 border border-amber-500/40`;
      default:
        return `${base} bg-emerald-500/10 text-emerald-300 border border-emerald-500/40`;
    }
  }

  function signalColorClass(signal) {
    switch (signal) {
      case "Exit All":
        return "text-red-400";
      case "Sell 50%":
        return "text-orange-300";
      case "Sell 30%":
        return "text-amber-300";
      default:
        return "text-emerald-300";
    }
  }

  function statusBgClass(status) {
    switch (status) {
      case "UP":
        return "bg-emerald-500/10";
      case "PULLBACK":
        return "bg-sky-500/10";
      default:
        return "bg-slate-800/80";
    }
  }

  function getTrendChip(status) {
    let base =
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium";
    switch (status) {
      case "UP":
        return `${base} bg-emerald-500/10 text-emerald-300`;
      case "PULLBACK":
        return `${base} bg-sky-500/10 text-sky-300`;
      default:
        return `${base} bg-slate-700/80 text-slate-300`;
    }
  }

  // sparkline mini
  function createSparklineSvg(values) {
    if (!values || values.length === 0) return "";
    const w = 80;
    const h = 24;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const step = values.length > 1 ? w / (values.length - 1) : 0;
    let d = "";
    values.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2; // padding 2px
      d += (i === 0 ? "M" : "L") + x + " " + y + " ";
    });

    return `<svg viewBox="0 0 ${w} ${h}" class="w-20 h-6">
      <path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" />
    </svg>`;
  }

  // ===== modal tentang aplikasi =====
  function openAbout() {
    if (!aboutModal) return;
    aboutModal.classList.remove("hidden");
  }

  function closeAbout() {
    if (!aboutModal) return;
    aboutModal.classList.add("hidden");
  }

  if (btnAbout) btnAbout.addEventListener("click", openAbout);
  if (aboutOverlay) aboutOverlay.addEventListener("click", closeAbout);
  if (btnAboutClose) btnAboutClose.addEventListener("click", closeAbout);
  if (btnAboutCloseBottom)
    btnAboutCloseBottom.addEventListener("click", closeAbout);

  // ===== PENGATURAN TRAILING STOP (GLOBAL) =====
  async function loadTSConfig() {
    if (!ts1Input || !ts2Input || !ts3Input) return;

    const { data, error } = await db
      .from("trailing_config")
      .select("ts1_pct, ts2_pct, ts3_pct")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Gagal load config TS:", error);
      ts1Input.value = 5;
      ts2Input.value = 10;
      ts3Input.value = 15;
      return;
    }

    if (data) {
      ts1Input.value = data.ts1_pct;
      ts2Input.value = data.ts2_pct;
      ts3Input.value = data.ts3_pct;
    } else {
      ts1Input.value = 5;
      ts2Input.value = 10;
      ts3Input.value = 15;
    }
  }

  if (btnSaveTSConfig) {
    btnSaveTSConfig.addEventListener("click", async () => {
      const ts1 = parseFloat(ts1Input.value);
      const ts2 = parseFloat(ts2Input.value);
      const ts3 = parseFloat(ts3Input.value);

      if (
        !isFinite(ts1) ||
        !isFinite(ts2) ||
        !isFinite(ts3) ||
        ts1 <= 0 ||
        ts2 <= 0 ||
        ts3 <= 0
      ) {
        alert("Nilai TS harus berupa persen > 0.");
        return;
      }

      try {
        btnSaveTSConfig.disabled = true;
        btnSaveTSConfig.textContent = "Menyimpan...";

        const { error } = await db.from("trailing_config").insert({
          ts1_pct: ts1,
          ts2_pct: ts2,
          ts3_pct: ts3,
        });

        if (error) {
          console.error(error);
          alert("Gagal menyimpan pengaturan TS.");
        } else {
          alert(
            "Pengaturan trailing stop tersimpan.\nData tren akan memakai nilai baru."
          );
          loadDashboard && loadDashboard();
          const kode = kodeSahamFilter?.value?.trim().toUpperCase();
          if (kode) loadTrend(kode);
        }
      } finally {
        btnSaveTSConfig.disabled = false;
        btnSaveTSConfig.textContent = "⚙️ Simpan pengaturan TS";
      }
    });
  }

  loadTSConfig();

  // ===== GET or CREATE saham.id =====
  async function getOrCreateSahamId(kode) {
    const kodeUpper = kode.trim().toUpperCase();

    let { data, error } = await db
      .from("saham")
      .select("id")
      .eq("kode", kodeUpper)
      .maybeSingle();

    if (error) throw error;
    if (data) return data.id;

    const { data: inserted, error: insErr } = await db
      .from("saham")
      .insert({ kode: kodeUpper })
      .select("id")
      .single();

    if (insErr) throw insErr;
    return inserted.id;
  }

  // ===== BTN SAVE INPUT DATA =====
  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      inputMessage.textContent = "";
      inputMessage.className =
        "text-xs text-right min-h-[1.25rem] text-slate-300";

      try {
        const kode = kodeSahamInput.value;
        const closePrice = parseFloat(closePriceInput.value);
        let closeDate = closeDateInput.value;

        if (!kode || !closePrice) {
          inputMessage.textContent =
            "Kode saham dan harga close wajib diisi.";
          inputMessage.classList.add("text-red-400");
          return;
        }

        if (!closeDate) {
          const today = new Date();
          closeDate = today.toISOString().slice(0, 10);
        }

        const sahamId = await getOrCreateSahamId(kode);

        const { error } = await db.from("saham_harga").upsert(
          {
            saham_id: sahamId,
            close_date: closeDate,
            close_price: closePrice,
          },
          {
            onConflict: "saham_id,close_date",
          }
        );

        if (error) throw error;

        inputMessage.textContent = "Data tersimpan.";
        inputMessage.classList.add("text-emerald-400");
        closePriceInput.value = "";
      } catch (err) {
        console.error(err);
        inputMessage.textContent = "Gagal menyimpan data.";
        inputMessage.classList.add("text-red-400");
      }
    });
  }

  // ===== DASHBOARD RINGKAS =====
  async function loadDashboard() {
    if (!dashboardList) return;
    dashboardList.innerHTML = "";

    const { data, error } = await db
      .from("saham_ringkas_view")
      .select("*")
      .order("kode", { ascending: true });

    if (error) {
      console.error(error);
      const div = document.createElement("div");
      div.className =
        "text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2";
      div.textContent = "Gagal memuat dashboard.";
      dashboardList.appendChild(div);
      return;
    }

    if (!data || data.length === 0) {
      const div = document.createElement("div");
      div.className =
        "text-sm text-slate-300 bg-slate-800/70 border border-slate-700/80 rounded-xl px-3 py-2";
      div.textContent = "Belum ada saham yang tercatat.";
      dashboardList.appendChild(div);
      return;
    }

    data.forEach((row) => {
      const item = document.createElement("div");
      item.className =
        "flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-slate-800 " +
        statusBgClass(row.status_tren);

      const left = document.createElement("div");
      left.className = "flex flex-col";

      const kodeLine = document.createElement("div");
      kodeLine.className = "flex items-center gap-2";
      const kodeSpan = document.createElement("span");
      kodeSpan.className =
        "text-xs font-semibold text-slate-100 tracking-tight";
      kodeSpan.textContent = row.kode;

      const kategoriSpan = document.createElement("span");
      kategoriSpan.className =
        "text-[10px] px-2 py-0.5 rounded-full bg-slate-900/60 text-slate-300";
      kategoriSpan.textContent = row.kategori || "default";

      kodeLine.appendChild(kodeSpan);
      kodeLine.appendChild(kategoriSpan);

      const infoLine = document.createElement("div");
      infoLine.className = "text-[10px] text-slate-400";
      infoLine.textContent = `Close ${row.close_price?.toFixed(
        2
      )} | DD ${row.drawdown_pct?.toFixed(2)}%`;

      left.appendChild(kodeLine);
      left.appendChild(infoLine);

      const right = document.createElement("div");
      right.className = "flex flex-col items-end gap-1";

      const signalSpan = document.createElement("span");
      signalSpan.className =
        "text-[11px] font-semibold " + signalColorClass(row.signal);
      signalSpan.textContent = row.signal;

      const statusSpan = document.createElement("span");
      statusSpan.className =
        "text-[10px] text-slate-300 inline-flex items-center gap-1";
      statusSpan.textContent = row.status_tren;

      right.appendChild(signalSpan);
      right.appendChild(statusSpan);

      item.appendChild(left);
      item.appendChild(right);

      dashboardList.appendChild(item);
    });
  }

  if (btnReloadDashboard) {
    btnReloadDashboard.addEventListener("click", () => {
      loadDashboard();
    });
  }

  loadDashboard();

  // ===== FUNGSI MUAT TREN (dipakai tombol & setelah edit) =====
  async function loadTrend(kodeParam) {
    trendList.innerHTML = "";

    const kode = (kodeParam || "").trim().toUpperCase();
    if (!kode) return;

    const { data, error } = await db
      .from("saham_tren_view")
      .select("*")
      .eq("kode", kode)
      .order("close_date", { ascending: false })
      .limit(60);

    if (error) {
      console.error(error);
      const div = document.createElement("div");
      div.className =
        "text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2";
      div.textContent = "Gagal memuat data tren.";
      trendList.appendChild(div);
      return;
    }

    if (!data || data.length === 0) {
      const div = document.createElement("div");
      div.className =
        "text-sm text-slate-300 bg-slate-800/70 border border-slate-700/80 rounded-xl px-3 py-2";
      div.textContent = "Belum ada data harga untuk saham ini.";
      trendList.appendChild(div);
      return;
    }

    const sparkValues = data
      .map((r) => r.close_price)
      .filter((v) => typeof v === "number")
      .slice()
      .reverse()
      .slice(-20);

    data.forEach((row, idx) => {
      const isLatest = idx === 0;

      const card = document.createElement("div");
      card.className =
        "rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-xs flex flex-col gap-1.5";

      if (isLatest) {
        card.className +=
          " border-sky-500/40 shadow-lg shadow-sky-500/20";
      }

      if (row.signal === "Exit All") {
        card.className += " bg-red-950/40";
      } else if (row.signal === "Sell 50%") {
        card.className += " bg-orange-950/30";
      } else if (row.signal === "Sell 30%") {
        card.className += " bg-amber-950/20";
      }

      const header = document.createElement("div");
      header.className = "flex items-center justify-between gap-2";

      const left = document.createElement("div");
      left.className = "flex items-center gap-2";

      const kodeSpan = document.createElement("span");
      kodeSpan.className =
        "text-sm font-semibold tracking-tight text-slate-100";
      kodeSpan.textContent = row.kode;

      const dateSpan = document.createElement("span");
      dateSpan.className = "text-[11px] text-slate-400";
      dateSpan.textContent = row.close_date;

      left.appendChild(kodeSpan);
      left.appendChild(dateSpan);

      const right = document.createElement("div");
      right.className = "flex items-center gap-2";

      const statusChip = document.createElement("span");
      statusChip.className = getTrendChip(row.status_tren);
      statusChip.textContent = row.status_tren;

      const signalBadge = document.createElement("span");
      signalBadge.className = getSignalBadge(row.signal);
      signalBadge.textContent = row.signal;

      right.appendChild(statusChip);
      right.appendChild(signalBadge);

      header.appendChild(left);
      header.appendChild(right);

      card.appendChild(header);

      if (isLatest && sparkValues.length > 1) {
        const sparkWrap = document.createElement("div");
        sparkWrap.className =
          "flex items-center gap-1 text-[10px] text-slate-400 mt-1";
        sparkWrap.innerHTML =
          '<span>Trend 20 hari:</span><span class="text-sky-400">' +
          createSparklineSvg(sparkValues) +
          "</span>";
        card.appendChild(sparkWrap);
      }

      const body = document.createElement("div");
      body.className =
        "grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px] text-slate-300";

      let closeInputEl = null;
      let closeDisplayEl = null;
      let saveBtn = null;

      const items = [
        {
          label: "Close",
          value:
            row.close_price != null ? row.close_price.toFixed(2) : "-",
          key: "close",
        },
        {
          label: "Peak",
          value:
            row.peak_price != null ? row.peak_price.toFixed(2) : "-",
          key: "peak",
        },
        {
          label: "TS1",
          value:
            row.ts1_price != null ? row.ts1_price.toFixed(2) : "-",
          key: "ts1",
        },
        {
          label: "TS2",
          value:
            row.ts2_price != null ? row.ts2_price.toFixed(2) : "-",
          key: "ts2",
        },
        {
          label: "TS3",
          value:
            row.ts3_price != null ? row.ts3_price.toFixed(2) : "-",
          key: "ts3",
        },
        {
          label: "Drawdown",
          value:
            row.drawdown_pct != null
              ? row.drawdown_pct.toFixed(2) + " %"
              : "-",
          key: "dd",
        },
      ];

      items.forEach((it) => {
        const wrapper = document.createElement("div");
        const label = document.createElement("div");
        label.className = "text-[10px] text-slate-500";
        label.textContent = it.label;

        const val = document.createElement("div");
        val.className = "font-medium";

        if (it.key === "close") {
          const span = document.createElement("span");
          span.textContent = it.value;
          span.className =
            "cursor-pointer underline decoration-dotted underline-offset-2";

          const input = document.createElement("input");
          input.type = "number";
          input.step = "0.01";
          input.value =
            row.close_price != null ? row.close_price.toFixed(2) : "";
          input.className =
            "hidden w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-0.5 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500";

          val.appendChild(span);
          val.appendChild(input);

          closeDisplayEl = span;
          closeInputEl = input;

          span.addEventListener("click", () => {
            if (!closeInputEl) return;
            closeDisplayEl.classList.add("hidden");
            closeInputEl.classList.remove("hidden");
            if (saveBtn) saveBtn.classList.remove("hidden");
            closeInputEl.focus();
            closeInputEl.select();
          });

          input.addEventListener("keydown", (e) => {
            if (
              e.key === "Enter" &&
              saveBtn &&
              !saveBtn.classList.contains("hidden")
            ) {
              saveBtn.click();
            }
          });
        } else {
          val.textContent = it.value;
        }

        wrapper.appendChild(label);
        wrapper.appendChild(val);
        body.appendChild(wrapper);
      });

      const footer = document.createElement("div");
      footer.className = "flex justify-end mt-2";

      saveBtn = document.createElement("button");
      saveBtn.textContent = "Simpan perubahan";
      saveBtn.className =
        "hidden inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-emerald-950 shadow-md shadow-emerald-500/30 hover:bg-emerald-400 transition active:scale-[0.99]";
      footer.appendChild(saveBtn);

      saveBtn.addEventListener("click", async () => {
        try {
          if (!closeInputEl) return;
          const newVal = parseFloat(closeInputEl.value);
          if (!newVal || isNaN(newVal)) {
            alert("Nilai close tidak valid.");
            return;
          }

          if (!row.harga_id) {
            alert("ID harga tidak tersedia (periksa view saham_tren_view).");
            return;
          }

          saveBtn.disabled = true;
          saveBtn.textContent = "Menyimpan...";

          const { error } = await db
            .from("saham_harga")
            .update({ close_price: newVal })
            .eq("id", row.harga_id);

          if (error) {
            console.error(error);
            alert("Gagal menyimpan perubahan.");
          } else {
            await loadTrend(kode);
          }
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = "Simpan perubahan";
        }
      });

      card.appendChild(body);
      card.appendChild(footer);

      trendList.appendChild(card);
    });

    // ====== CATATAN SAHAM ======
    if (catatanSaham) {
      const { data: sahamRow, error: errSaham } = await db
        .from("saham")
        .select("catatan")
        .eq("kode", kode)
        .maybeSingle();

      if (!errSaham && sahamRow) {
        catatanSaham.value = sahamRow.catatan || "";
      } else {
        catatanSaham.value = "";
      }

      if (btnSaveCatatan && !btnSaveCatatan._bound) {
        btnSaveCatatan._bound = true;
        btnSaveCatatan.addEventListener("click", async () => {
          const teks = catatanSaham.value || "";
          const { error: errUpdate } = await db
            .from("saham")
            .update({ catatan: teks })
            .eq("kode", kode);

          if (errUpdate) {
            alert("Gagal menyimpan catatan.");
          } else {
            alert("Catatan tersimpan.");
            loadDashboard();
          }
        });
      }
    }

    // ====== EXPORT CSV ======
    if (btnExportCsv && !btnExportCsv._bound) {
      btnExportCsv._bound = true;
      btnExportCsv.addEventListener("click", () => {
        if (!data || data.length === 0) {
          alert("Belum ada data untuk diexport.");
          return;
        }
        const header = [
          "tanggal",
          "kode",
          "close",
          "peak",
          "ts1",
          "ts2",
          "ts3",
          "drawdown_pct",
          "signal",
          "status_tren",
        ];
        const rows = data
          .slice()
          .reverse()
          .map((row) => [
            row.close_date,
            row.kode,
            row.close_price,
            row.peak_price,
            row.ts1_price,
            row.ts2_price,
            row.ts3_price,
            row.drawdown_pct,
            row.signal,
            row.status_tren,
          ]);

        const csvLines = [
          header.join(","),
          ...rows.map((r) =>
            r
              .map((val) =>
                val == null ? "" : String(val).replace(/,/g, ".")
              )
              .join(",")
          ),
        ];
        const blob = new Blob([csvLines.join("\n")], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tren_${kode}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }

  if (btnLoadTrend) {
    btnLoadTrend.addEventListener("click", () => {
      const kode = kodeSahamFilter.value.trim().toUpperCase();
      if (!kode) return;
      loadTrend(kode);
    });
  }
})();
