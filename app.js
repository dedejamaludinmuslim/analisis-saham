// app.js (Isi sama dengan perbaikan terakhir Anda)
(function () {
  const { createClient } = supabase;

  // GANTI DENGAN KUNCI SUPABASE ANDA
  const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TP_PCT = 0.10; // Target Profit +10%
  const CUT_PCT = -0.05; // Cut Loss -5%
  const TS1_PCT = 0.05; // Trailing Stop 1: High -5%
  const TS2_PCT = 0.10; // Trailing Stop 2: High -10%

  // Konstanta Baru untuk Sinyal
  const RE_ENTRY_CHECK_PCT = 0.05; // High harus > Entry +5% agar Re-entry/TS Hit valid
  const ADD_ON_PCT = 0.03; // Ambang batas Add-On (Profit > 3%)

  // Elemen DOM
  const kodeEl = document.getElementById("kode");
  const lastPriceEl = document.getElementById("last_price");
  const autocompleteListEl = document.getElementById("autocomplete-list"); // <--- BARU
  const btnSave = document.getElementById("btn-save");
  const btnSetEntry = document.getElementById("btn-set-entry");
  const btnAbout = document.getElementById("btn-about");
  const aboutDashboardEl = document.getElementById("about-dashboard");
  const cardsContainer = document.getElementById("cards-container");
  const summaryRowEl = document.getElementById("summary-row");

  let currentId = null;
  let currentRows = [];
  let deferredPrompt; // Untuk PWA

  // Helper Functions
  function parseNum(val) {
    if (typeof val === 'string') {
      val = val.replace(/,/g, '');
    }
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  function formatNum(num) {
    if (typeof num === 'number' && !isNaN(num)) {
      return num.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    return '0';
  }

  function formatPct(num) {
    if (typeof num === 'number' && !isNaN(num)) {
      return (num * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }
    return '0.00%';
  }

  // =========================================================
  // FITUR BARU: AUTOCOMPLETE / REKOMENDASI KODE SAHAM
  // =========================================================

  let activeItemIndex = -1; // Untuk navigasi keyboard

  function showAutocomplete() {
    const inputVal = (kodeEl.value || "").trim().toUpperCase();
    if (!inputVal) {
      autocompleteListEl.innerHTML = "";
      autocompleteListEl.style.display = "none";
      activeItemIndex = -1;
      return;
    }

    // Ambil semua kode saham unik yang ada di database
    const filteredCodes = currentRows
      .map(row => row.kode)
      .filter(kode => kode && kode.includes(inputVal))
      .sort((a, b) => a.localeCompare(b)) // Urutkan secara alfabetis
      .slice(0, 8); // Batasi hingga 8 rekomendasi

    if (filteredCodes.length === 0) {
      autocompleteListEl.innerHTML = "";
      autocompleteListEl.style.display = "none";
      activeItemIndex = -1;
      return;
    }

    autocompleteListEl.innerHTML = filteredCodes
      .map((kode, index) => {
        const classActive = index === activeItemIndex ? "active" : "";
        return `<div class="autocomplete-item ${classActive}" data-kode="${kode}">${kode}</div>`;
      })
      .join("");
      
    autocompleteListEl.style.display = "block";
    activeItemIndex = 0; // Setel ke item pertama
  }
  
  function selectAutocompleteItem(kode) {
      if (kode) {
          kodeEl.value = kode;
          // Cari data saham ini untuk mode EDIT
          const row = currentRows.find((r) => r.kode === kode);
          if (row) {
              currentId = row.id;
              // Isi Last Price jika ada, jika tidak, kosongkan
              lastPriceEl.value = row.last_price ? formatNum(row.last_price) : ""; 
              if (btnSave) btnSave.textContent = "💾 Update";
          } else {
              currentId = null;
              lastPriceEl.value = "";
              if (btnSave) btnSave.textContent = "💾 Simpan";
          }
      }
      autocompleteListEl.innerHTML = "";
      autocompleteListEl.style.display = "none";
      activeItemIndex = -1;
      kodeEl.focus(); // Fokus kembali ke input
  }

  function handleKeydown(e) {
    const items = autocompleteListEl.querySelectorAll(".autocomplete-item");
    if (items.length === 0 || autocompleteListEl.style.display === "none") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeItemIndex = (activeItemIndex + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeItemIndex = (activeItemIndex - 1 + items.length) % items.length;
    } else if (e.key === "Enter") {
      // Hentikan perilaku default (form submit)
      e.preventDefault(); 
      if (activeItemIndex > -1) {
        selectAutocompleteItem(items[activeItemIndex].getAttribute("data-kode"));
        return; 
      }
    }
    
    // Update kelas active
    items.forEach((item, index) => {
        if (index === activeItemIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
  }
  
  // Listener untuk input kode saham
  if (kodeEl) kodeEl.addEventListener("input", showAutocomplete);
  if (kodeEl) kodeEl.addEventListener("keydown", handleKeydown); // Tambahkan listener keydown untuk navigasi
  
  // Listener untuk klik pada item rekomendasi
  if (autocompleteListEl) autocompleteListEl.addEventListener("click", (e) => {
      const item = e.target.closest(".autocomplete-item");
      if (item) {
          selectAutocompleteItem(item.getAttribute("data-kode"));
      }
  });
  
  // Sembunyikan rekomendasi saat klik di luar
  document.addEventListener("click", (e) => {
      if (!kodeEl.contains(e.target) && !autocompleteListEl.contains(e.target)) {
          autocompleteListEl.innerHTML = "";
          autocompleteListEl.style.display = "none";
          activeItemIndex = -1;
      }
  });


  // =========================================================
  // LOGIKA UTAMA APLIKASI
  // =========================================================

  function calculateSignal(row) {
    const { entry_price, last_price, highest_price } = row;

    if (!entry_price || !last_price) {
      return { signal: "HOLD", class: "sig-hold" };
    }

    const profitPct = (last_price / entry_price) - 1;
    const highProfitPct = (highest_price / entry_price) - 1;

    // Hitung level cut loss dan target
    const cutLossPrice = entry_price * (1 + CUT_PCT);
    const targetPrice = entry_price * (1 + TP_PCT);

    // Hitung Trailing Stop levels
    const ts1Price = highest_price * (1 - TS1_PCT);
    const ts2Price = highest_price * (1 - TS2_PCT);

    // --- Signal Logic ---

    // 1. Target Profit tercapai
    if (profitPct >= TP_PCT) {
      return { signal: "TP +10%", class: "sig-tp" };
    }

    // 2. Cut Loss
    if (profitPct <= CUT_PCT) {
      return { signal: `LOSS ${formatPct(CUT_PCT)}`, class: "sig-cut" };
    }

    // 3. Trailing Stop Hit (Hanya berlaku jika pernah untung > RE_ENTRY_CHECK_PCT)
    if (highProfitPct >= RE_ENTRY_CHECK_PCT) {
      if (last_price <= ts2Price) {
        return { signal: `TS HIT (TS2)`, class: "sig-tshit" };
      }
      if (last_price <= ts1Price) {
        return { signal: `TS HIT (TS1)`, class: "sig-tshit" };
      }
    }

    // 4. Add-On / Pyramiding
    if (profitPct >= ADD_ON_PCT) {
      return { signal: "ADD-ON", class: "sig-addon" };
    }
    
    // 5. Re-Entry Check
    // Kondisi: pernah untung signifikan, tapi harga sekarang turun
    if (highProfitPct >= RE_ENTRY_CHECK_PCT && last_price < highest_price) {
        // Cek apakah harga saat ini berada di zona "Beli Ulang"
        // Misalnya: Di atas Cut Loss tapi di bawah Highest - 5% (atau High - 10%)
        // Jika sudah melewati TS Hit, sinyal Re-entry tidak berlaku, karena sudah harusnya dijual.
        
        // Asumsi: Jika di bawah TS1/TS2, sudah TS HIT. Jadi Re-Entry adalah di zona
        // setelah profit 5% namun sebelum TS HIT. Ini terlalu kompleks.
        
        // Sederhanakan: Jika profit > 0% dan < Add-On (3%)
        if (profitPct > 0 && profitPct < ADD_ON_PCT) {
             return { signal: "PROFIT", class: "sig-run" };
        }
        
        // Sinyal Re-Entry disederhanakan sebagai kesempatan beli ulang di harga rendah
        // setelah terjadi koreksi signifikan dari harga tertinggi.
        // Jika harga saat ini di bawah (Highest - TS1_PCT) TAPI DI ATAS Entry Price
        if (last_price < ts1Price && last_price > entry_price) {
            return { signal: "RE-ENTRY", class: "sig-reentry" };
        }
    }


    // 6. Profit Biasa
    if (profitPct > 0) {
      return { signal: "PROFIT", class: "sig-run" };
    }

    // 7. Hold / Rugi minor
    return { signal: "HOLD", class: "sig-hold" };
  }

  function renderDashboard() {
    cardsContainer.innerHTML = '';
    summaryRowEl.innerHTML = '';

    if (currentRows.length === 0) {
      cardsContainer.innerHTML = '<div class="empty-state">Belum ada data. Tambahkan minimal satu saham lewat panel kiri.</div>';
      return;
    }

    // Sort: Profit terbaik ke terburuk
    currentRows.sort((a, b) => {
      const profitA = (a.last_price / a.entry_price) - 1;
      const profitB = (b.last_price / b.entry_price) - 1;
      return profitB - profitA;
    });

    let totalUrgent = 0;
    let totalProfit = 0;
    let totalLoss = 0;

    currentRows.forEach(row => {
      const { kode, entry_price, last_price, highest_price, id } = row;
      const { signal, class: signalClass } = calculateSignal(row);

      const profitPct = (last_price / entry_price) - 1;
      const profitPrice = last_price - entry_price;
      const gainClass = profitPct > 0 ? 'gain-pos' : profitPct < 0 ? 'gain-neg' : 'gain-zero';
      
      const ts1Price = highest_price * (1 - TS1_PCT);
      const ts2Price = highest_price * (1 - TS2_PCT);

      if (signal.includes('LOSS') || signal.includes('TS HIT')) {
        totalUrgent++;
      }
      
      if (profitPct > 0) {
          totalProfit++;
      } else if (profitPct < 0) {
          totalLoss++;
      }
      
      const cardHtml = `
        <div class="stock-card" data-id="${id}">
          <div class="stock-main">
            <div class="stock-code">${kode}</div>
            <div class="stock-gain ${gainClass}">
              ${formatPct(profitPct)}
            </div>
          </div>
          <div class="signal-pill ${signalClass}">
            ${signal}
          </div>
          <div class="stock-rows">
            <div>
              <div class="row-label">Entry</div>
              <div class="row-value">${formatNum(entry_price)}</div>
            </div>
            <div>
              <div class="row-label">Last Price</div>
              <div class="row-value">${formatNum(last_price)}</div>
            </div>
            <div>
              <div class="row-label">Keuntungan (Rp)</div>
              <div class="row-value ${gainClass}">${formatNum(profitPrice)}</div>
            </div>
          </div>
          <div class="ts-row">
            <span>High: ${formatNum(highest_price)}</span>
            <span>TS1: <span class="ts1">${formatNum(ts1Price)}</span></span>
            <span>TS2: <span class="ts2">${formatNum(ts2Price)}</span></span>
          </div>
        </div>
      `;
      cardsContainer.insertAdjacentHTML('beforeend', cardHtml);
    });

    // Render Summary Chips
    let summaryHtml = '';
    
    if (totalUrgent > 0) {
        summaryHtml += `<div class="summary-chip summary-chip-urgent">🚨 **URGENT** (${totalUrgent} Saham)</div>`;
    }
    
    summaryHtml += `<div class="summary-chip">Total Saham: <strong>${currentRows.length}</strong></div>`;
    summaryHtml += `<div class="summary-chip">Profit: <strong>${totalProfit}</strong></div>`;
    summaryHtml += `<div class="summary-chip">Loss/Hold: <strong>${totalLoss}</strong></div>`;

    summaryRowEl.innerHTML = summaryHtml;
  }

  async function loadData() {
    const { data, error } = await db
      .from("portofolio_saham")
      .select("*")
      .order("kode", { ascending: true }); // Ambil data dulu baru sort profit

    if (error) {
      console.error("Gagal memuat data:", error);
      return;
    }

    currentRows = data;
    renderDashboard();
  }

  function resetForm() {
    currentId = null;
    if (kodeEl) kodeEl.value = "";
    if (lastPriceEl) lastPriceEl.value = "";
    if (btnSave) btnSave.textContent = "💾 Simpan";
    if (autocompleteListEl) {
        autocompleteListEl.innerHTML = "";
        autocompleteListEl.style.display = "none";
        activeItemIndex = -1;
    }
    if (kodeEl) kodeEl.focus();
  }
  
  function toggleAbout() {
      const isHidden = aboutDashboardEl.style.display === 'none' || aboutDashboardEl.style.display === '';
      aboutDashboardEl.style.display = isHidden ? 'block' : 'none';
      cardsContainer.style.display = isHidden ? 'none' : 'block';
      summaryRowEl.style.display = isHidden ? 'none' : 'flex';
      
      if (btnAbout) btnAbout.textContent = isHidden ? "❌ Tutup Info" : "ℹ️ About";
      if (document.getElementById('right-title')) document.getElementById('right-title').textContent = isHidden ? "Tentang Dashboard" : "Tren Semua Saham";
      if (document.getElementById('right-badge')) document.getElementById('right-badge').textContent = isHidden ? "Panduan" : "Sinyal: TS • CL • TP • RE • AD • PR • HO";
  }


  async function saveData() {
    const kode = (kodeEl.value || "").trim().toUpperCase();
    const lastPrice = parseNum(lastPriceEl.value);
    
    // =========================================================
    // FITUR BARU: LOGIKA HAPUS DATA JIKA KODE DIKOSONGKAN
    // =========================================================
    if (currentId && !kode) {
      if (confirm("Kode saham dikosongkan. Yakin ingin menghapus data ini dari portofolio?")) {
        const { error: deleteError } = await db
          .from("portofolio_saham")
          .delete()
          .eq("id", currentId);

        if (deleteError) {
          console.error("Gagal hapus:", deleteError);
          alert("Gagal hapus data: " + deleteError.message);
        } else {
          alert("Data berhasil dihapus!");
        }
        
        resetForm();
        await loadData();
        return;
      } else {
          // Jika batal hapus, jangan lanjutkan proses save
          return;
      }
    }
    // =========================================================
    // AKHIR LOGIKA HAPUS DATA
    // =========================================================

    if (!kode || !lastPrice) {
      alert("Isi Kode Saham dan Last Price dulu.");
      return;
    }
    
    const existingRow = currentRows.find(r => r.kode === kode);

    if (currentId || existingRow) {
      // MODE UPDATE (Edit Kartu atau Update Kode yang Sudah Ada)
      const idToUpdate = currentId || existingRow.id;
      const currentEntryPrice = existingRow ? existingRow.entry_price : lastPrice;
      const currentHighestPrice = existingRow ? existingRow.highest_price : lastPrice;
      
      const newHighestPrice = Math.max(currentHighestPrice, lastPrice);

      const { data, error } = await db
        .from("portofolio_saham")
        .update({ 
          last_price: lastPrice, 
          highest_price: newHighestPrice 
        })
        .eq("id", idToUpdate)
        .select()
        .single();
        
      if (error) {
        console.error("Gagal update:", error);
        alert("Gagal update data: " + error.message);
      } else {
        alert(`Harga ${kode} berhasil diupdate!`);
      }
      
    } else {
      // MODE INSERT (Saham Baru)
      const { data, error } = await db
        .from("portofolio_saham")
        .insert({
          kode: kode,
          entry_price: lastPrice, // Untuk pertama kali, entry = last
          last_price: lastPrice,
          highest_price: lastPrice, // Untuk pertama kali, highest = last
          user_id: "default",
        })
        .select()
        .single();

      if (error) {
        // Cek jika error karena kode saham duplikat (unik constraint)
        if (error.code === '23505') {
             alert(`Kode saham ${kode} sudah ada di database. Silakan gunakan mode 'Update' atau 'Set Entry Baru'.`);
        } else {
             console.error("Gagal simpan:", error);
             alert("Gagal simpan data: " + error.message);
        }
      } else {
        alert(`Data ${kode} berhasil disimpan!`);
      }
    }

    resetForm();
    await loadData();
  }
  
  async function setNewEntryPrice(kode, newPrice) {
      // Fungsi ini hanya dipanggil jika konfirmasi sudah dilakukan
      const existingRow = currentRows.find(r => r.kode === kode);
      
      if (!existingRow) {
          // Jika saham benar-benar baru, gunakan saveData (mode insert)
          await saveData();
          return;
      }
      
      // Jika saham sudah ada, lakukan UPDATE Entry Price dan reset High
      const { data, error } = await db
        .from("portofolio_saham")
        .update({ 
          entry_price: newPrice, // Ganti entry price
          last_price: newPrice,  // Last price juga di set ke harga baru
          highest_price: newPrice // Highest direset ke harga baru
        })
        .eq("id", existingRow.id)
        .select()
        .single();
        
      if (error) {
        console.error("Gagal Set Entry Baru:", error);
        alert("Gagal set entry baru: " + error.message);
      } else {
        alert(`Entry Price ${kode} berhasil disetel ulang menjadi ${formatNum(newPrice)}!`);
      }
      
      resetForm();
      await loadData();
  }


  // Event Listeners
  document.addEventListener("DOMContentLoaded", loadData);

  // FIX: Mengubah listener menjadi async dan menambahkan await saveData()
  if (btnSave) {
    btnSave.addEventListener("click", async (e) => {
      e.preventDefault();
      await saveData();
    });
  }
  
  if (btnSetEntry) {
    // FIX: Mengubah listener menjadi async dan menambahkan await setNewEntryPrice()
    btnSetEntry.addEventListener("click", async (e) => {
      e.preventDefault();
      const kode = (kodeEl.value || "").trim().toUpperCase();
      const lastPrice = parseNum(lastPriceEl.value);

      if (!kode || !lastPrice) {
        alert("Isi Kode Saham dan Harga saat ini (Entry Baru) dulu.");
        return;
      }
      
      if (!confirm(`Yakin ingin menyetel ulang Entry Price ${kode} menjadi ${formatNum(lastPrice)}? Semua data HIGH akan direset (Entry = Last = High).`)) {
          return;
      }
      
      await setNewEntryPrice(kode, lastPrice);
    });
  }


  if (btnAbout) {
    btnAbout.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAbout();
    });
  }

  // Listener untuk klik pada kartu saham (Mode Edit)
  if (cardsContainer) {
    cardsContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".stock-card");
      if (!card) return;

      const id = card.getAttribute("data-id");
      const row = currentRows.find((r) => r.id === id);

      if (row) {
        currentId = row.id;
        if (kodeEl) kodeEl.value = row.kode;
        if (lastPriceEl) lastPriceEl.value = row.last_price ? formatNum(row.last_price) : "";
        if (btnSave) btnSave.textContent = "💾 Update";
        if (kodeEl) kodeEl.focus();
      }
    });
  }
  
  // =========================================================
  // PWA/Install App Logic
  // =========================================================
  
  const btnInstall = document.getElementById("btn-install");

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall) btnInstall.hidden = false;
  });

  if (btnInstall) {
    btnInstall.addEventListener('click', (e) => {
      e.preventDefault();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          } else {
            console.log('User dismissed the install prompt');
          }
          deferredPrompt = null;
          btnInstall.hidden = true;
        });
      }
    });
  }
  
})();
