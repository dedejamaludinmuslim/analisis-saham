(function () {
  const { createClient } = supabase;

  const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs";

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

  // helper warna signal
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

  // GET or CREATE saham.id
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

  // BTN SAVE
  btnSave.addEventListener("click", async () => {
    inputMessage.textContent = "";
    inputMessage.className = "text-xs text-right min-h-[1.25rem]";

    try {
      const kode = kodeSahamInput.value;
      const closePrice = parseFloat(closePriceInput.value);
      let closeDate = closeDateInput.value;

      if (!kode || !closePrice) {
        inputMessage.textContent = "Kode saham dan harga close wajib diisi.";
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

  // BTN LOAD TREN
  btnLoadTrend.addEventListener("click", async () => {
    trendList.innerHTML = "";

    const kode = kodeSahamFilter.value.trim().toUpperCase();
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

    // ... di atas sudah ada const2 lain
  
    const btnAbout = document.getElementById("btnAbout");
    const aboutModal = document.getElementById("aboutModal");
    const aboutOverlay = document.getElementById("aboutOverlay");
    const btnAboutClose = document.getElementById("btnAboutClose");
    const btnAboutCloseBottom = document.getElementById("btnAboutCloseBottom");
  
    function openAbout() {
      if (!aboutModal) return;
      aboutModal.classList.remove("hidden");
    }
  
    function closeAbout() {
      if (!aboutModal) return;
      aboutModal.classList.add("hidden");
    }
  
    if (btnAbout) {
      btnAbout.addEventListener("click", openAbout);
    }
    if (aboutOverlay) {
      aboutOverlay.addEventListener("click", closeAbout);
    }
    if (btnAboutClose) {
      btnAboutClose.addEventListener("click", closeAbout);
    }
    if (btnAboutCloseBottom) {
      btnAboutCloseBottom.addEventListener("click", closeAbout);
    }
    
    data.forEach((row, idx) => {
      const isLatest = idx === 0;

      const card = document.createElement("div");
      card.className =
        "rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-xs flex flex-col gap-1.5";

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

      const body = document.createElement("div");
      body.className =
        "grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px] text-slate-300";

      const items = [
        {
          label: "Close",
          value:
            row.close_price != null ? row.close_price.toFixed(2) : "-",
        },
        {
          label: "Peak",
          value:
            row.peak_price != null ? row.peak_price.toFixed(2) : "-",
        },
        {
          label: "TS1",
          value: row.ts1_price != null ? row.ts1_price.toFixed(2) : "-",
        },
        {
          label: "TS2",
          value: row.ts2_price != null ? row.ts2_price.toFixed(2) : "-",
        },
        {
          label: "TS3",
          value: row.ts3_price != null ? row.ts3_price.toFixed(2) : "-",
        },
        {
          label: "Drawdown",
          value:
            row.drawdown_pct != null
              ? row.drawdown_pct.toFixed(2) + " %"
              : "-",
        },
      ];

      items.forEach((it) => {
        const wrapper = document.createElement("div");
        const label = document.createElement("div");
        label.className = "text-[10px] text-slate-500";
        label.textContent = it.label;
        const val = document.createElement("div");
        val.className = "font-medium";
        val.textContent = it.value;
        wrapper.appendChild(label);
        wrapper.appendChild(val);
        body.appendChild(wrapper);
      });

      if (isLatest) {
        card.className +=
          " border-sky-500/40 shadow-lg shadow-sky-500/20";
      }

      card.appendChild(header);
      card.appendChild(body);
      trendList.appendChild(card);
    });
  });
})();
