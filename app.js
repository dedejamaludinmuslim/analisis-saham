// ==========================================
// 1. KONFIGURASI SUPABASE
// ==========================================
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const statusMessage = document.getElementById('statusMessage');
const dateFilter = document.getElementById('dateFilter'); 
const signalFilter = document.getElementById('signalFilter');
const maFastInput = document.getElementById('maFast'); 
const maSlowInput = document.getElementById('maSlow'); 
const applyMaCustomButton = document.getElementById('applyMaCustom'); 
const stockSearchInput = document.getElementById('stockSearchInput');
const stockSearchResults = document.getElementById('stockSearchResults');
const stockSearchContainer = document.getElementById('stockSearchContainer');
const csvFileInput = document.getElementById('csvFileInput');
const refreshAnalysisBtn = document.getElementById('refreshAnalysisBtn');
const installBtn = document.getElementById('installAppBtn'); // Tombol PWA

// Modal Elements
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const modalCompanyName = document.getElementById('modalCompanyName');
const rawIndicatorTableBody = document.querySelector('#rawIndicatorTable tbody');
const portfolioStatusToggle = document.getElementById('portfolioStatusToggle');

// About Modal Elements
const aboutModal = document.getElementById('aboutModal');
const aboutBtn = document.getElementById('aboutBtn');
const closeAboutBtn = document.getElementById('closeAboutBtn');

let priceChart = null; 

// ==========================================
// 3. GLOBAL STATE
// ==========================================
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let globalPortfolioAnalysis = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 
let currentModalStockCode = null; 

const categories = {
    maCross: { tableBody: document.querySelector('#maCrossTable tbody'), statusEl: document.getElementById('maStatus'), tableEl: document.getElementById('maCrossTable') },
    rsi: { tableBody: document.querySelector('#rsiTable tbody'), statusEl: document.getElementById('rsiStatus'), tableEl: document.getElementById('rsiTable') },
    macd: { tableBody: document.querySelector('#macdTable tbody'), statusEl: document.getElementById('macdStatus'), tableEl: document.getElementById('macdTable') },
    volume: { tableBody: document.querySelector('#volumeTable tbody'), statusEl: document.getElementById('volumeStatus'), tableEl: document.getElementById('volumeTable') }
};

// ==========================================
// 4. DATA FETCHING & SMART PORTFOLIO
// ==========================================

async function fetchPortfolio() {
    try {
        const { data: rawData, error } = await supabaseClient
            .from('portofolio_saham')
            .select('kode_saham, harga_beli, harga_tertinggi_sejak_beli'); 
        
        if (error) throw error;
        
        globalPortfolio = new Map(rawData.map(item => [
            item.kode_saham, 
            { hargaBeli: item.harga_beli }
        ]));

        const targetDate = dateFilter.value || new Date().toISOString().split('T')[0];
        
        const { data: analysisData, error: rpcError } = await supabaseClient
            .rpc('get_portfolio_analysis', { target_date: targetDate });

        globalPortfolioAnalysis = new Map();
        
        if (!rpcError && analysisData) {
            analysisData.forEach(item => {
                globalPortfolioAnalysis.set(item.kode_saham, item);
            });
        }

        return globalPortfolio;
    } catch (error) {
        console.warn('Info: Portofolio kosong/gagal load.', error.message);
        return new Map(); 
    }
}

// FUNGSI UPDATE STATUS PORTFOLIO (SIMETRI DAN PENGHAPUSAN OPSI TANGGAL BELI)
async function togglePortfolioStatus(stockCode, currentIsOwned) {
    // A. LOGIKA HAPUS (JIKA SUDAH PUNYA)
    if (currentIsOwned) {
        const result = await Swal.fire({
            title: `Hapus ${stockCode}?`,
            text: "Saham ini akan dihapus dari pemantauan portofolio Anda.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Ya, Hapus',
            cancelButtonText: 'Batal'
        });

        if (result.isConfirmed) {
            try {
                await supabaseClient.from('portofolio_saham').delete().eq('kode_saham', stockCode);
                globalPortfolio.delete(stockCode);
                if(globalPortfolioAnalysis) globalPortfolioAnalysis.delete(stockCode);

                Swal.fire({ icon: 'success', title: 'Dihapus!', text: `${stockCode} dihapus dari portofolio.`, timer: 1500, showConfirmButton: false });
            } catch (error) { 
                Swal.fire({ icon: 'error', title: 'Gagal', text: error.message });
                return false; 
            }
        } else { return false; }

    // B. LOGIKA TAMBAH/BELI BARU (Simetri UI dan Hapus Input Duplikat)
    } else {
        const latestPrice = await getLatestStockPrice(stockCode);
        const latestDate = dateFilter.value; // Tanggal Beli = Tanggal Analisis Terakhir
        
        if (!latestPrice) { 
            Swal.fire({ icon: 'error', title: 'Data Tidak Tersedia', text: 'Harga saham ini belum tersedia.' });
            return false; 
        }

        // Popup Input Harga (Satu Input Field Saja)
        const { value: inputPrice } = await Swal.fire({
            title: `Tambah ${stockCode}`,
            html: `
                <p style="margin-bottom: 10px; color: #6b7280;">Harga penutupan terakhir (${latestDate}): <b>Rp ${formatNumber(latestPrice, false, true)}</b></p>
                <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    <label for="swal-input-price" style="display:block; text-align:center; font-size:0.9rem; font-weight:600; margin-bottom:5px;">Masukkan Harga Beli:</label>
                    <input id="swal-input-price" class="swal2-input" type="number" value="${latestPrice}" min="1" step="1" style="width: 80%; margin-top: 0; text-align: center;">
                </div>
            `,
            input: 'text', // Menggunakan 'text' untuk mengontrol input HTML secara penuh
            showCancelButton: true,
            focusConfirm: false,
            preConfirm: () => { 
                const price = document.getElementById('swal-input-price').value;
                if (!price || parseFloat(price) <= 0) {
                    Swal.showValidationMessage('Harga beli harus valid dan lebih dari Rp 0!');
                    return false;
                }
                // Mengizinkan harga beli yang berbeda (historis)
                return parseFloat(price);
            },
            confirmButtonColor: '#4f46e5',
            confirmButtonText: 'Simpan',
            cancelButtonText: 'Batal'
        });
        
        // Pengecekan inputPrice setelah preConfirm
        if (inputPrice && inputPrice > 0) {
            try {
                // Saat menyimpan, kita menggunakan harga yang diinput pengguna (inputPrice)
                await supabaseClient.from('portofolio_saham').upsert({ 
                    kode_saham: stockCode, 
                    harga_beli: inputPrice, 
                    tanggal_beli: latestDate, // Menggunakan tanggal analisis sebagai tanggal beli
                    harga_tertinggi_sejak_beli: inputPrice 
                }, { onConflict: 'kode_saham' });
                
                globalPortfolio.set(stockCode, { hargaBeli: inputPrice });
                await fetchPortfolio();
                
                Swal.fire({ icon: 'success', title: 'Berhasil!', text: `${stockCode} disimpan dengan harga Rp ${formatNumber(inputPrice, false, true)}.`, timer: 2000, showConfirmButton: false });
            } catch (error) { 
                Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: error.message });
                return false; 
            }
        } else { return false; }
    }
    
    if (currentModalStockCode === stockCode) updatePortfolioStatusDisplay(stockCode);
    categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value));
    return true;
}
async function getLatestStockPrice(stockCode) {
     const targetDate = dateFilter.value;
     try {
         const { data } = await supabaseClient.from('data_saham').select('"Penutupan"').eq('Kode Saham', stockCode).eq('Tanggal Perdagangan Terakhir', targetDate).limit(1);
         return data?.[0]?.Penutupan || null;
     } catch { return null; }
}

async function fetchCustomMASignals(targetDate, maFast, maSlow) {
    statusMessage.textContent = `Proses MA Kustom...`;
    globalCustomMASignals = []; 
    try {
        const { data, error } = await supabaseClient.rpc('get_custom_ma_signals', { ma_fast_period: parseInt(maFast), ma_slow_period: parseInt(maSlow), target_date: targetDate });
        if (error) throw error;
        globalCustomMASignals = data; return data;
    } catch { return []; }
}

function mergeSignals(staticSignals, customMASignals) {
    const mergedMap = new Map();
    staticSignals.forEach(s => {
        if (s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume || s.power_score) {
            mergedMap.set(s["Kode Saham"], { ...s });
        }
    });
    customMASignals.forEach(cs => {
        const existing = mergedMap.get(cs["Kode Saham"]) || {};
        mergedMap.set(cs["Kode Saham"], { 
            ...existing, ...cs, 
            Penutupan: cs.Close || cs.Penutupan, 
            Volume: cs.Volume, Selisih: cs.Selisih, Sinyal_MA: cs.Sinyal_MA 
        });
    });
    globalPortfolio.forEach((val, key) => { if (!mergedMap.has(key)) { /* Logic optional fetch if needed */ } });
    return Array.from(mergedMap.values()).filter(item => item.Sinyal_MA || item.Sinyal_RSI || item.Sinyal_MACD || item.Sinyal_Volume || item.power_score > 0 || globalPortfolio.has(item["Kode Saham"]));
}

// MEMPERBARUI FUNGSI UNTUK MENGAMBIL POWER SCORE (Tahap 2)
async function fetchAndRenderSignals(selectedDate = null) {
    statusMessage.textContent = 'Memuat data...';
    applyMaCustomButton.disabled = true;

    try {
        if (!selectedDate) {
            const latest = await initializeDateInput();
            if(!latest) { statusMessage.textContent = "Database kosong."; return; }
            selectedDate = latest; 
        }

        await fetchPortfolio(); 

        // PANGGIL RPC untuk mendapatkan sinyal dan Power Score
        const { data: signalData, error: signalError } = await supabaseClient.rpc('get_signals_with_score', { target_date: selectedDate }); 
        
        if (signalError) throw signalError;
        
        if (!signalData || signalData.length === 0) {
            statusMessage.textContent = `Tidak ada data perdagangan pada tanggal ${selectedDate}.`;
            globalCombinedSignals = [];
            categorizeAndRender([]); 
            return;
        }

        // MENGGABUNGKAN DATA FUNDAMENTAL & SINYAL
        const { data: fundamentalData } = await supabaseClient.from('data_saham')
            .select(`"Kode Saham", "Penutupan", "Volume", "Selisih"`)
            .eq('Tanggal Perdagangan Terakhir', selectedDate);

        const fundamentalMap = {};
        if (fundamentalData) fundamentalData.forEach(item => fundamentalMap[item["Kode Saham"]] = item);
        
        const staticCombinedSignals = [];
        signalData.forEach(s => {
            if (fundamentalMap[s["Kode Saham"]]) staticCombinedSignals.push({ ...s, ...fundamentalMap[s["Kode Saham"]] });
        });
        
        let finalSignals;
        if (globalCustomMASignals.length > 0 && selectedDate === globalCustomMASignals[0].Tanggal) {
            finalSignals = mergeSignals(staticCombinedSignals, globalCustomMASignals);
        } else {
            finalSignals = staticCombinedSignals.filter(s => 
                s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume || s.power_score > 0 || globalPortfolio.has(s["Kode Saham"])
            );
        }
        
        globalCombinedSignals = finalSignals;
        sortState = { column: 'Kode Saham', direction: 'asc' };
        categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value));

    } catch (error) { statusMessage.textContent = `Error: ${error.message}`; } 
    finally { applyMaCustomButton.disabled = false; }
}

// ==========================================
// 5. CSV UPLOAD HANDLER
// ==========================================
async function clearTempTable() {
    await supabaseClient.from('temp_saham').delete().neq('Kode Saham', 'XXXXXX'); 
}

async function uploadBatches(rows) {
    const BATCH_SIZE = 100;
    try {
        await clearTempTable();
        const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
        for (let i = 0; i < totalBatches; i++) {
            const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
            if(Swal.isVisible()) {
                Swal.getHtmlContainer().querySelector('b').textContent = `${(i+1) * BATCH_SIZE} / ${rows.length}`;
            }
            const { error } = await supabaseClient.from('temp_saham').insert(batch);
            if (error) throw error;
        }
        return true;
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Gagal Upload', text: error.message });
        return false;
    }
}

csvFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Swal.fire({
        title: 'Upload Data Saham?', text: `File: ${file.name}`, icon: 'question',
        showCancelButton: true, confirmButtonColor: '#4f46e5', cancelButtonColor: '#d33', confirmButtonText: 'Ya, Proses!', cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: async (results) => {
                    Swal.fire({ title: 'Sedang Memproses...', html: `Mengunggah <b>${results.data.length}</b> baris data.`, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                    const success = await uploadBatches(results.data);
                    if (success) {
                        Swal.fire({ icon: 'success', title: 'Selesai!', text: 'Data berhasil diunggah.', timer: 3000, showConfirmButton: false });
                        csvFileInput.value = ''; 
                        setTimeout(() => fetchAndRenderSignals(), 3000);
                    }
                }
            });
        } else { csvFileInput.value = ''; }
    });
});

// ==========================================
// 6. FITUR REFRESH ANALISA (MANUAL)
// ==========================================
refreshAnalysisBtn?.addEventListener('click', async () => {
    const result = await Swal.fire({
        title: 'Refresh Analisa?', 
        text: "Update status Trailing Stop & Cut Loss Portofolio dengan data terbaru.", 
        icon: 'question',
        showCancelButton: true, confirmButtonColor: '#4f46e5', confirmButtonText: 'Ya, Jalankan', cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Sedang Mengupdate...', text: 'Menghitung ulang status portofolio...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        try {
            const { error } = await supabaseClient.rpc('refresh_market_analysis');
            if (error) throw error;
            await fetchAndRenderSignals(); 
            Swal.fire({ icon: 'success', title: 'Selesai!', text: 'Portofolio diperbarui.', timer: 2000, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Gagal', text: error.message });
        }
    }
});

// ==========================================
// 7. EVENT LISTENERS UI LAINNYA
// ==========================================

// Search Logic
async function searchStocks(query) {
    if (query.length < 2) { stockSearchResults.style.display = 'none'; return []; }
    try {
        const { data } = await supabaseClient.from('data_saham').select(`"Kode Saham", "Nama Perusahaan"`).ilike('Kode Saham', `${query}%`).limit(20);
        const unique = [], seen = new Set();
        data.forEach(item => { if(!seen.has(item["Kode Saham"])) { seen.add(item["Kode Saham"]); unique.push({code:item["Kode Saham"], name:item["Nama Perusahaan"]}); }});
        return unique;
    } catch { return []; }
}
let searchTimeout;
stockSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const res = await searchStocks(e.target.value.trim().toUpperCase());
        stockSearchResults.innerHTML = '';
        if(!res.length) { stockSearchResults.style.display='none'; return;}
        res.forEach(i => {
            const d = document.createElement('div'); d.className='search-result-item';
            d.innerHTML = `<span class="search-result-code">${i.code}</span><span class="search-result-name">${i.name}</span>`;
            d.onclick = () => { showStockDetailModal(i.code); stockSearchInput.value=''; stockSearchResults.style.display='none'; };
            stockSearchResults.appendChild(d);
        });
        stockSearchResults.style.display='block';
    }, 300);
});
document.addEventListener('click', (e) => { if (!stockSearchContainer.contains(e.target)) stockSearchResults.style.display = 'none'; });

// UI Listeners Load
document.addEventListener('DOMContentLoaded', () => {
    dateFilter?.addEventListener('change', () => { globalCustomMASignals = []; fetchAndRenderSignals(dateFilter.value); });
    signalFilter?.addEventListener('change', () => categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value)));
    applyMaCustomButton?.addEventListener('click', async () => { await fetchCustomMASignals(dateFilter.value, maFastInput.value, maSlowInput.value); fetchAndRenderSignals(dateFilter.value); });

    setupSorting();
    
    // Modal Listeners
    const hideModal = () => stockDetailModal.style.display = 'none';
    closeModalBtn?.addEventListener('click', hideModal);
    stockDetailModal?.addEventListener('click', (e) => { if (e.target === stockDetailModal) hideModal(); });
    portfolioStatusToggle?.addEventListener('click', async () => await togglePortfolioStatus(currentModalStockCode, portfolioStatusToggle.classList.contains('owned')));

    aboutBtn?.addEventListener('click', () => { aboutModal.style.display = 'flex'; });
    closeAboutBtn?.addEventListener('click', () => { aboutModal.style.display = 'none'; });
    aboutModal?.addEventListener('click', (e) => { if (e.target === aboutModal) aboutModal.style.display = 'none'; });

    fetchAndRenderSignals(); 
});

// ==========================================
// 8. RENDERING & HELPERS
// ==========================================

async function initializeDateInput() {
    try {
        const { data } = await supabaseClient.from('indikator_teknikal').select('Tanggal').order('Tanggal', { ascending: false }).limit(1);
        if (data && data.length > 0) {
            const latestDate = data[0].Tanggal;
            dateFilter.value = latestDate; dateFilter.max = new Date().toISOString().split("T")[0]; 
            return latestDate;
        }
        return null;
    } catch { return null; }
}

function applySignalFilter(signals, filterType) {
    if (filterType === 'ALL') return signals;
    if (filterType === 'OWNED') return signals.filter(item => globalPortfolio.has(item["Kode Saham"]));
    
    return signals.filter(item => {
        const pfAnalysis = globalPortfolioAnalysis.get(item["Kode Saham"]);
        const pfStatus = pfAnalysis ? pfAnalysis.status_aksi : "";

        const txt = [item.Sinyal_MA, item.Sinyal_RSI, item.Sinyal_MACD, item.Sinyal_Volume, pfStatus].join(' ').toUpperCase();
        
        if (filterType === 'BUY') return txt.includes('BUY') || txt.includes('ADD ON') || txt.includes('GOLDEN') || txt.includes('OVERSOLD') || (item.power_score && item.power_score > 20);
        if (filterType === 'SELL') return txt.includes('SELL') || txt.includes('CUT LOSS') || txt.includes('TAKE PROFIT') || txt.includes('OVERBOUGHT') || txt.includes('DEAD') || (item.power_score && item.power_score < 0);
        if (filterType === 'WATCH') return txt.includes('WATCH') || txt.includes('SPIKE');
        return false;
    });
}

function getSignalClass(signal) {
    if (!signal) return ''; const s = signal.toUpperCase();
    if (s.includes('BUY') || s.includes('ADD ON') || s.includes('GOLDEN') || s.includes('OVERSOLD')) return 'badge badge-buy';
    if (s.includes('SELL') || s.includes('CUT LOSS') || s.includes('DEAD') || s.includes('OVERBOUGHT')) return 'badge badge-sell';
    if (s.includes('WATCH') || s.includes('SPIKE') || s.includes('WAIT')) return 'badge badge-watch';
    return 'badge badge-neutral';
}

function formatNumber(num, isVolume = false, isRawPrice = false) { 
    if (num === null || num === undefined) return '-'; const n = parseFloat(num);
    if (isVolume) { if (n >= 1e9) return (n/1e9).toFixed(2)+' M'; if (n >= 1e6) return (n/1e6).toFixed(2)+' Jt'; return n.toLocaleString('id-ID'); }
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: isRawPrice ? 0 : 2 }).format(n);
}

function sortSignals(signals, column, direction) {
    return signals.sort((a, b) => {
        let valA = a[column], valB = b[column];
        if (column === 'Untung/Rugi') {
            const buyA = globalPortfolio.get(a["Kode Saham"])?.hargaBeli || 0;
            const buyB = globalPortfolio.get(b["Kode Saham"])?.hargaBeli || 0;
            valA = buyA > 0 ? (a.Penutupan - buyA) / buyA : -999; valB = buyB > 0 ? (b.Penutupan - buyB) / buyB : -999;
        }
        if (['Penutupan', 'Volume', 'Selisih', 'power_score'].includes(column)) { valA = parseFloat(valA)||0; valB = parseFloat(valB)||0; }
        return direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
}

function categorizeAndRender(signals) {
    const sorted = sortSignals([...signals], sortState.column, sortState.direction);
    const cat = { maCross: [], rsi: [], macd: [], volume: [] };
    
    sorted.forEach(item => {
        if (!item.Penutupan) return; 
        const isOwned = globalPortfolio.has(item["Kode Saham"]);
        if (item.Sinyal_MA || item.power_score > 0 || isOwned) cat.maCross.push(item);
        if (item.Sinyal_RSI || item.power_score > 0) cat.rsi.push(item);
        if (item.Sinyal_MACD || item.power_score > 0) cat.macd.push(item);
        if (item.Sinyal_Volume || item.power_score > 0) cat.volume.push(item);
    });
    
    renderCategory('maCross', cat.maCross); renderCategory('rsi', cat.rsi); renderCategory('volume', cat.volume); renderCategory('macd', cat.macd);
    
    let count = signals.length;
    let dateTxt = dateFilter.value;
    statusMessage.textContent = count > 0 ? `Menampilkan ${count} saham (${dateTxt})` : `Tidak ada sinyal signifikan untuk ${dateTxt}`;
    updateSortIcons();
    document.querySelectorAll('.clickable-stock').forEach(el => el.onclick = handleStockClick);
}

// MEMPERBARUI FUNGSI RENDER UNTUK URUTAN KOLOM BARU
function renderCategory(key, data) {
    const { tableBody, statusEl, tableEl } = categories[key];
    const sigKey = `Sinyal_${key.replace('maCross','MA').replace('rsi','RSI').replace('macd','MACD').replace('volume','Volume')}`;
    tableBody.innerHTML = '';
    if (data.length === 0) { statusEl.style.display = 'block'; tableEl.style.display = 'none'; return; }
    statusEl.style.display = 'none'; tableEl.style.display = 'table'; 
    data.forEach(item => {
        const row = tableBody.insertRow();
        const code = item["Kode Saham"];
        const pf = globalPortfolio.get(code);
        
        // 1. Kode
        row.insertCell().innerHTML = `<span class="clickable-stock">${code}</span>`;

        // 2. Tanggal
        row.insertCell().textContent = item.Tanggal ? item.Tanggal.slice(5) : '-';

        // 3. Harga Penutupan
        row.insertCell().textContent = formatNumber(item.Penutupan, false, true);

        // 4. Volume
        row.insertCell().textContent = formatNumber(item.Volume, true);

        // 5. Chg% (Selisih)
        const chg = parseFloat(item.Selisih || 0);
        const chgCell = row.insertCell();
        chgCell.className = chg > 0 ? 'text-green' : (chg < 0 ? 'text-red' : ''); 
        chgCell.textContent = `${chg>0?'+':''}${chg.toFixed(2)}%`;
        
        // 6. Avg Price
        row.insertCell().textContent = pf ? formatNumber(pf.hargaBeli, false, true) : '-';

        // 7. P/L %
        const plCell = row.insertCell();
        if (pf) {
            const pnl = ((item.Penutupan - pf.hargaBeli) / pf.hargaBeli) * 100;
            plCell.className = pnl >= 0 ? 'text-green' : 'text-red'; 
            plCell.textContent = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
        } else { plCell.textContent = '-'; }

        // 8. Status (Smart Badge) 
        const statusCell = row.insertCell();
        if (pf) {
            const analysis = globalPortfolioAnalysis.get(code);
            if (analysis) {
                statusCell.innerHTML = `<span class="badge ${analysis.warna_badge}" title="${analysis.alasan}" style="cursor:help;">${analysis.status_aksi}</span>`;
            } else {
                statusCell.innerHTML = `<span class="badge badge-owned">OWNED</span>`;
            }
        } else {
            statusCell.innerHTML = `<span class="badge badge-neutral">WATCH</span>`;
        }
        
        // 9. POWER SCORE 
        const score = item.power_score || 0;
        const scoreCell = row.insertCell();
        scoreCell.style.fontWeight = 'bold';
        if (score >= 40) { scoreCell.className = 'text-green'; scoreCell.textContent = `${score} (STRONG BUY)`; }
        else if (score > 0) { scoreCell.className = 'text-green'; scoreCell.textContent = `${score} (BUY)`; }
        else if (score === 0) { scoreCell.textContent = `-`; }
        else { scoreCell.className = 'text-red'; scoreCell.textContent = `${score} (SELL)`; }

        // 10. Sinyal
        const signalText = item[sigKey] || '-';
        row.insertCell().innerHTML = `<span class="${getSignalClass(signalText)}">${signalText}</span>`;
    });
}

function setupSorting() { 
    document.querySelectorAll('th[data-column]').forEach(th => { 
        th.addEventListener('click', function() { 
            const col = this.getAttribute('data-column'); 
            sortState.direction = (sortState.column === col && sortState.direction === 'asc') ? 'desc' : 'asc'; 
            sortState.column = col; 
            categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value)); 
        }); 
    }); 
}

function updateSortIcons() { 
    document.querySelectorAll('th[data-column]').forEach(th => { 
        const icon = th.querySelector('.sort-icon'); 
        if(icon) { 
            icon.textContent = '↕'; 
            if(th.getAttribute('data-column') === sortState.column) icon.textContent = sortState.direction === 'asc' ? '↑' : '↓'; 
        } 
    }); 
}

function handleStockClick(e) { showStockDetailModal(e.target.textContent); }

// ==========================================
// 9. MODAL DETAIL - CODE FINAL TANPA FUNDAMENTAL
// ==========================================
async function showStockDetailModal(stockCode) {
    currentModalStockCode = stockCode; 
    modalTitle.textContent = stockCode; 
    modalCompanyName.textContent = "Memuat data..."; 
    updatePortfolioStatusDisplay(stockCode);
    stockDetailModal.style.display = 'flex'; 
    
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="8">Memuat...</td></tr>'; 
    if(priceChart) priceChart.destroy();
    
    try {
        // BAGIAN 1: Ambil Nama Perusahaan
        const { data: latestFundamental } = await supabaseClient.from('data_saham')
            .select(`"Nama Perusahaan"`)
            .eq('Kode Saham', stockCode)
            .order('Tanggal Perdagangan Terakhir', { ascending: false })
            .limit(1); 
            
        const fundamentalData = latestFundamental?.[0];

        // BAGIAN 2: Ambil Indikator (ATR, MA, RSI, dll. - 60 hari)
        const { data: indicators } = await supabaseClient
            .from('indikator_teknikal')
            .select(`*, "ATR_14"`) 
            .eq('Kode Saham', stockCode)
            .order('Tanggal', { ascending: false })
            .limit(60); 

        if(!indicators || !indicators.length) { 
            rawIndicatorTableBody.innerHTML = '<tr><td colspan="8">Data indikator kosong</td></tr>'; 
            modalCompanyName.textContent = "Data indikator tidak ditemukan"; 
            return; 
        }
        
        const dates = indicators.map(i => i.Tanggal);
        
        // BAGIAN 3: Ambil Harga Historis (Penutupan) untuk 60 hari indikator
        const { data: prices } = await supabaseClient.from('data_saham')
            .select(`"Tanggal Perdagangan Terakhir", "Penutupan"`) 
            .eq('Kode Saham', stockCode)
            .in('Tanggal Perdagangan Terakhir', dates); 
            
        // ========================================================
        // RENDERING NAMA PERUSAHAAN
        // ========================================================
        if (fundamentalData) {
            modalCompanyName.textContent = fundamentalData["Nama Perusahaan"] || "Nama Perusahaan Tidak Ditemukan";
        } else {
            modalCompanyName.textContent = "Nama perusahaan tidak ditemukan";
        }

        // ========================================================
        // RENDERING TABEL & GRAFIK
        // ========================================================
        
        const priceMap = new Map(); prices?.forEach(p => priceMap.set(p["Tanggal Perdagangan Terakhir"], p.Penutupan));
        const histData = indicators.map(i => ({ ...i, Penutupan: priceMap.get(i.Tanggal) })).reverse();
        
        // PENGISIAN TABEL HISTORIS (Menampilkan ATR)
        rawIndicatorTableBody.innerHTML = '';
        [...histData].reverse().forEach(d => {
            const r = rawIndicatorTableBody.insertRow();
            r.insertCell().textContent = d.Tanggal; 
            r.insertCell().textContent = formatNumber(d.Penutupan, false, true); 
            r.insertCell().textContent = parseFloat(d.RSI||0).toFixed(2); 
            r.insertCell().textContent = parseFloat(d.MACD_Line||0).toFixed(2); 
            r.insertCell().textContent = parseFloat(d.Signal_Line||0).toFixed(2); 
            r.insertCell().textContent = formatNumber(d.MA_5, false, true); 
            r.insertCell().textContent = formatNumber(d.MA_20, false, true);
            r.insertCell().textContent = parseFloat(d.ATR_14||0).toFixed(2);
        });

        // GRAFIK
        const ctx = document.getElementById('priceIndicatorChart').getContext('2d');
        priceChart = new Chart(ctx, { 
            type: 'line', 
            data: { labels: histData.map(d => d.Tanggal.slice(5)), datasets: [ { label: 'Harga', data: histData.map(d => d.Penutupan), borderColor: '#4f46e5', tension: 0.1, yAxisID: 'y' }, { label: 'MA5', data: histData.map(d => d.MA_5), borderColor: '#f43f5e', borderWidth:1, pointRadius:0, yAxisID: 'y' }, { label: 'MA20', data: histData.map(d => d.MA_20), borderColor: '#0ea5e9', borderWidth:1, pointRadius:0, yAxisID: 'y' } ] }, 
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left', grid: { display: false } } }, plugins: { legend: { labels: { boxWidth: 10 } } } } 
        });
    } catch (e) { rawIndicatorTableBody.innerHTML = `<tr><td colspan="8">Error: ${e.message}</td></tr>`; }
}

function updatePortfolioStatusDisplay(code) { 
    const owned = globalPortfolio.has(code); 
    portfolioStatusToggle.className = owned ? 'owned' : ''; 
    portfolioStatusToggle.textContent = owned ? `Hapus dari Portofolio` : 'Tambahkan ke Portofolio'; // Perbaikan teks
}

// ==========================================
// 10. PWA INSTALLATION LOGIC
// ==========================================
let deferredPrompt;

// 1. Cek jika sudah terinstal
window.addEventListener('appinstalled', () => {
    if(installBtn) installBtn.style.display = 'none';
    deferredPrompt = null;
    console.log('Aplikasi berhasil diinstal');
});

// 2. Tangkap event browser
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if(installBtn) installBtn.style.display = 'inline-flex';
});

// 3. Klik Tombol
if(installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });
}
