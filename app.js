// GANTI DENGAN KREDENSIAL SUPABASE ANDA
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

// --- ELEMEN DOM UTAMA ---
const statusMessage = document.getElementById('statusMessage');
const dateFilter = document.getElementById('dateFilter'); 
const signalFilter = document.getElementById('signalFilter');
const maFastInput = document.getElementById('maFast'); 
const maSlowInput = document.getElementById('maSlow'); 
const applyMaCustomButton = document.getElementById('applyMaCustom'); 
// Elemen Pencarian & Upload
const stockSearchInput = document.getElementById('stockSearchInput');
const stockSearchResults = document.getElementById('stockSearchResults');
const stockSearchContainer = document.getElementById('stockSearchContainer');
const csvFileInput = document.getElementById('csvFileInput'); // Input File Baru

// --- DOM MODAL ---
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const rawIndicatorTableBody = document.querySelector('#rawIndicatorTable tbody');
const portfolioStatusToggle = document.getElementById('portfolioStatusToggle');
let priceChart = null; 

// --- GLOBAL STATE ---
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 
let currentModalStockCode = null; 

const categories = {
    maCross: { tableBody: document.querySelector('#maCrossTable tbody'), statusEl: document.getElementById('maStatus'), tableEl: document.getElementById('maCrossTable') },
    rsi: { tableBody: document.querySelector('#rsiTable tbody'), statusEl: document.getElementById('rsiStatus'), tableEl: document.getElementById('rsiTable') },
    macd: { tableBody: document.querySelector('#macdTable tbody'), statusEl: document.getElementById('macdStatus'), tableEl: document.getElementById('macdTable') },
    volume: { tableBody: document.querySelector('#volumeTable tbody'), statusEl: document.getElementById('volumeStatus'), tableEl: document.getElementById('volumeTable') }
};

// ********************************************
// 1. DATA FETCHING & LOGIKA UTAMA
// ********************************************

async function fetchPortfolio() {
    try {
        const { data, error } = await supabaseClient.from('portofolio_saham').select('kode_saham, harga_beli'); 
        if (error) throw error;
        globalPortfolio = new Map(data.map(item => [item.kode_saham, { hargaBeli: item.harga_beli }]));
        return globalPortfolio;
    } catch (error) {
        console.warn('Info: Portofolio mungkin kosong.', error.message);
        return new Map(); 
    }
}

async function togglePortfolioStatus(stockCode, currentIsOwned) {
    if (currentIsOwned) {
        if(!confirm(`Hapus ${stockCode} dari Portofolio?`)) return false;
        try {
            const { error } = await supabaseClient.from('portofolio_saham').delete().eq('kode_saham', stockCode);
            if (error) throw error;
            globalPortfolio.delete(stockCode);
        } catch (error) { alert(`Gagal menghapus: ${error.message}`); return false; }
    } else {
        const latestPrice = await getLatestStockPrice(stockCode);
        const latestDate = dateFilter.value;
        if (latestPrice === null) { alert("Data harga tidak tersedia."); return false; }
        const confirmPrice = prompt(`Harga Beli untuk ${stockCode}:`, latestPrice);
        if (!confirmPrice || isNaN(parseFloat(confirmPrice))) return false;
        const buyPrice = parseFloat(confirmPrice);
        try {
            const { error } = await supabaseClient.from('portofolio_saham')
                .upsert({ kode_saham: stockCode, harga_beli: buyPrice, tanggal_beli: latestDate }, { onConflict: 'kode_saham' });
            if (error) throw error;
            globalPortfolio.set(stockCode, { hargaBeli: buyPrice });
        } catch (error) { alert(`Gagal menambah: ${error.message}`); return false; }
    }
    await fetchPortfolio();
    if (currentModalStockCode === stockCode) updatePortfolioStatusDisplay(stockCode);
    const filteredSignals = applySignalFilter(globalCombinedSignals, signalFilter.value);
    categorizeAndRender(filteredSignals);
    return true;
}

async function getLatestStockPrice(stockCode) {
     const targetDate = dateFilter.value;
     try {
         const { data } = await supabaseClient.from('data_saham').select('"Penutupan"').eq('Kode Saham', stockCode).eq('Tanggal Perdagangan Terakhir', targetDate).limit(1);
         return data && data.length > 0 ? data[0].Penutupan : null;
     } catch { return null; }
}

async function fetchCustomMASignals(targetDate, maFast, maSlow) {
    statusMessage.textContent = `Processing custom MA...`;
    globalCustomMASignals = []; 
    try {
        const { data, error } = await supabaseClient.rpc('get_custom_ma_signals', {
            ma_fast_period: parseInt(maFast), ma_slow_period: parseInt(maSlow), target_date: targetDate
        });
        if (error) throw error;
        globalCustomMASignals = data; 
        return data;
    } catch (error) { return []; }
}

function mergeSignals(staticSignals, customMASignals) {
    const mergedMap = new Map();
    staticSignals.forEach(s => {
        if (!(s.Sinyal_MA && !s.Sinyal_RSI && !s.Sinyal_MACD && !s.Sinyal_Volume)) mergedMap.set(s["Kode Saham"], { ...s });
    });
    customMASignals.forEach(cs => {
        const existing = mergedMap.get(cs["Kode Saham"]) || {};
        mergedMap.set(cs["Kode Saham"], { ...existing, ...cs, Penutupan: cs.Close || cs.Penutupan, Volume: cs.Volume, Selisih: cs.Selisih, Sinyal_MA: cs.Sinyal_MA });
    });
    return Array.from(mergedMap.values()).filter(item => item.Sinyal_MA || item.Sinyal_RSI || item.Sinyal_MACD || item.Sinyal_Volume);
}

async function fetchAndRenderSignals(selectedDate = null) {
    statusMessage.textContent = 'Memuat data pasar...';
    applyMaCustomButton.disabled = true;
    try {
        await fetchPortfolio(); 
        let signalQuery = supabaseClient.from('indikator_teknikal')
            .select(`"Kode Saham", "Tanggal", "Sinyal_MA", "Sinyal_RSI", "Sinyal_MACD", "Sinyal_Volume"`)
            .order('Tanggal', { ascending: false });
        if (selectedDate) signalQuery = signalQuery.eq('Tanggal', selectedDate);
        else signalQuery = signalQuery.limit(100);

        const { data: signalData, error: signalError } = await signalQuery;
        if (signalError) throw signalError;
        if (!signalData?.length) { statusMessage.textContent = 'Data tidak ditemukan.'; return; }

        const dateToFilter = selectedDate || signalData[0].Tanggal;
        if (!selectedDate) { await populateDateFilter(dateToFilter); dateFilter.value = dateToFilter; }
        
        const { data: fundamentalData } = await supabaseClient.from('data_saham')
            .select(`"Kode Saham", "Penutupan", "Volume", "Selisih"`)
            .eq('Tanggal Perdagangan Terakhir', dateToFilter);

        const fundamentalMap = {};
        if (fundamentalData) fundamentalData.forEach(item => fundamentalMap[item["Kode Saham"]] = item);
        
        const staticCombinedSignals = [];
        signalData.filter(s => s.Tanggal === dateToFilter).forEach(s => {
            if (fundamentalMap[s["Kode Saham"]]) staticCombinedSignals.push({ ...s, ...fundamentalMap[s["Kode Saham"]] });
        });
        
        let finalSignals;
        if (globalCustomMASignals.length > 0 && dateToFilter === globalCustomMASignals[0].Tanggal) {
            finalSignals = mergeSignals(staticCombinedSignals, globalCustomMASignals);
        } else {
            finalSignals = staticCombinedSignals.filter(s => s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume);
        }
        
        globalCombinedSignals = finalSignals;
        if (!selectedDate) sortState = { column: 'Kode Saham', direction: 'asc' };
        categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value));
    } catch (error) { statusMessage.textContent = `Gagal memuat: ${error.message}`; } 
    finally { applyMaCustomButton.disabled = false; }
}

// ********************************************
// 2. CSV UPLOAD LOGIC (NEW)
// ********************************************

// Fungsi untuk menghapus semua data di temp_saham sebelum upload
async function clearTempTable() {
    statusMessage.textContent = "Membersihkan data lama...";
    // Cara cepat hapus semua baris: delete tanpa filter
    const { error } = await supabaseClient.from('temp_saham').delete().neq('Kode Saham', 'XXXXXX'); 
    // .neq('Kode Saham', 'XXXXXX') adalah trik karena Supabase kadang menolak delete tanpa where clause. 
    // Asumsinya tidak ada saham bernama 'XXXXXX'.
    if (error) console.error("Gagal clear temp:", error);
}

// Fungsi Upload Batch
async function uploadBatches(rows) {
    const BATCH_SIZE = 100; // Kirim 100 baris per request
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    
    // 1. Bersihkan tabel dulu
    await clearTempTable();

    for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const batch = rows.slice(start, end);

        statusMessage.textContent = `Mengupload Batch ${i + 1}/${totalBatches} (${batch.length} baris)...`;

        const { error } = await supabaseClient.from('temp_saham').insert(batch);
        
        if (error) {
            console.error('Error insert batch:', error);
            alert(`Gagal upload di batch ${i + 1}: ${error.message}`);
            return false;
        }
    }
    return true;
}

// Handler saat file dipilih
csvFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    statusMessage.textContent = "Membaca file CSV...";
    
    // Gunakan PapaParse
    Papa.parse(file, {
        header: true, // Baris pertama adalah nama kolom
        skipEmptyLines: true, // Abaikan baris kosong
        complete: async (results) => {
            const data = results.data;
            
            if (data.length === 0) {
                alert("File CSV kosong atau format salah!");
                return;
            }

            console.log("Preview Data CSV:", data[0]);
            
            // Konfirmasi Upload
            if (confirm(`Akan mengupload ${data.length} baris data ke temp_saham. Data lama di temp_saham akan dihapus. Lanjutkan?`)) {
                const success = await uploadBatches(data);
                if (success) {
                    statusMessage.textContent = "Upload Sukses! Trigger database sedang memproses...";
                    alert("Data berhasil diupload ke temp_saham. Backend akan memproses data ini secara otomatis.");
                    // Reset input file agar bisa upload file yang sama lagi jika perlu
                    csvFileInput.value = '';
                    // Refresh tampilan setelah beberapa detik (opsional, tergantung seberapa cepat trigger backend selesai)
                    setTimeout(() => fetchAndRenderSignals(), 3000);
                } else {
                    statusMessage.textContent = "Upload Gagal.";
                }
            } else {
                statusMessage.textContent = "Upload Dibatalkan.";
                csvFileInput.value = '';
            }
        },
        error: (err) => {
            console.error("Error parsing CSV:", err);
            alert("Gagal membaca file CSV.");
        }
    });
});


// ********************************************
// 3. SEARCH & EVENT LISTENERS
// ********************************************

async function searchStocks(query) {
    if (query.length < 2) { stockSearchResults.style.display = 'none'; return []; }
    try {
        const { data } = await supabaseClient.from('data_saham').select(`"Kode Saham", "Nama Perusahaan"`).ilike('Kode Saham', `${query}%`).limit(50);
        const unique = []; const seen = new Set();
        data.forEach(item => {
            if (!seen.has(item["Kode Saham"])) { seen.add(item["Kode Saham"]); unique.push({ code: item["Kode Saham"], name: item["Nama Perusahaan"] || '' }); }
        });
        return unique.slice(0, 10);
    } catch { return []; }
}

function renderSearchResults(results) {
    stockSearchResults.innerHTML = '';
    if (results.length === 0) { stockSearchResults.style.display = 'none'; return; }
    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `<span class="search-result-code">${item.code}</span><span class="search-result-name">${item.name}</span>`;
        div.onclick = () => { showStockDetailModal(item.code); stockSearchInput.value = ''; stockSearchResults.style.display = 'none'; };
        stockSearchResults.appendChild(div);
    });
    stockSearchResults.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    dateFilter?.addEventListener('change', () => { globalCustomMASignals = []; fetchAndRenderSignals(dateFilter.value); });
    signalFilter?.addEventListener('change', () => categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value)));
    
    applyMaCustomButton?.addEventListener('click', async () => {
        if (parseInt(maFastInput.value) >= parseInt(maSlowInput.value)) { alert('MA Fast harus < MA Slow'); return; }
        await fetchCustomMASignals(dateFilter.value, maFastInput.value, maSlowInput.value);
        fetchAndRenderSignals(dateFilter.value);
    });

    setupSorting();
    
    // Modal
    const hideModal = () => stockDetailModal.style.display = 'none';
    closeModalBtn?.addEventListener('click', hideModal);
    stockDetailModal?.addEventListener('click', (e) => { if (e.target === stockDetailModal) hideModal(); });
    
    // Search
    let searchTimeout;
    stockSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => renderSearchResults(await searchStocks(e.target.value.trim().toUpperCase())), 300);
    });
    document.addEventListener('click', (e) => { if (!stockSearchContainer.contains(e.target)) stockSearchResults.style.display = 'none'; });
    
    portfolioStatusToggle?.addEventListener('click', async () => {
        await togglePortfolioStatus(currentModalStockCode, portfolioStatusToggle.classList.contains('owned'));
    });

    fetchAndRenderSignals(); 
});

// ********************************************
// 4. HELPER & RENDERING UTAMA
// ********************************************

async function populateDateFilter(latestDate) {
    try {
        const { data } = await supabaseClient.from('indikator_teknikal').select('Tanggal').order('Tanggal', { ascending: false }).limit(30); 
        const uniqueDates = [...new Set(data.map(item => item.Tanggal))];
        dateFilter.innerHTML = '';
        uniqueDates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = date + (date === latestDate ? ' (Terbaru)' : '');
            dateFilter.appendChild(option);
        });
        dateFilter.disabled = false;
    } catch {}
}

function getSignalClass(signal) {
    if (!signal) return '';
    const s = signal.toUpperCase();
    if (s.includes('BUY') || s.includes('GOLDEN') || s.includes('OVERSOLD')) return 'badge badge-buy';
    if (s.includes('SELL') || s.includes('DEAD') || s.includes('OVERBOUGHT')) return 'badge badge-sell';
    if (s.includes('WATCH') || s.includes('SPIKE')) return 'badge badge-watch';
    return 'badge badge-neutral';
}

function formatNumber(num, isVolume = false, isRawPrice = false) { 
    if (num === null || num === undefined) return '-';
    const number = parseFloat(num);
    if (isVolume) {
        if (number >= 1e9) return (number / 1e9).toFixed(2) + ' M';
        if (number >= 1e6) return (number / 1e6).toFixed(2) + ' Jt';
        return number.toLocaleString('id-ID');
    }
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: isRawPrice ? 0 : 2 }).format(number);
}

function applySignalFilter(signals, filterType) {
    if (filterType === 'ALL') return signals;
    return signals.filter(item => {
        const txt = [item.Sinyal_MA, item.Sinyal_RSI, item.Sinyal_MACD, item.Sinyal_Volume].join(' ').toUpperCase();
        if (filterType === 'BUY') return txt.includes('BUY') || txt.includes('OVERSOLD') || txt.includes('GOLDEN');
        if (filterType === 'SELL') return txt.includes('SELL') || txt.includes('OVERBOUGHT') || txt.includes('DEAD');
        if (filterType === 'WATCH') return txt.includes('WATCH') || txt.includes('SPIKE');
        return false;
    });
}

function sortSignals(signals, column, direction) {
    return signals.sort((a, b) => {
        let valA = a[column], valB = b[column];
        if (column === 'Untung/Rugi') {
            const buyA = globalPortfolio.get(a["Kode Saham"])?.hargaBeli || 0;
            const buyB = globalPortfolio.get(b["Kode Saham"])?.hargaBeli || 0;
            valA = buyA > 0 ? (a.Penutupan - buyA) / buyA : -999;
            valB = buyB > 0 ? (b.Penutupan - buyB) / buyB : -999;
        }
        if (['Penutupan', 'Volume', 'Selisih'].includes(column)) { valA = parseFloat(valA)||0; valB = parseFloat(valB)||0; }
        return direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
}

function categorizeAndRender(signals) {
    const sorted = sortSignals([...signals], sortState.column, sortState.direction);
    const cat = { maCross: [], rsi: [], macd: [], volume: [] };
    
    sorted.forEach(item => {
        if (!item.Penutupan) return; 
        if (item.Sinyal_MA) cat.maCross.push(item);
        if (item.Sinyal_RSI) cat.rsi.push(item);
        if (item.Sinyal_MACD) cat.macd.push(item);
        if (item.Sinyal_Volume) cat.volume.push(item);
    });
    
    renderCategory('maCross', cat.maCross);
    renderCategory('rsi', cat.rsi);
    renderCategory('volume', cat.volume);
    renderCategory('macd', cat.macd);
    
    statusMessage.textContent = `Tampilkan ${signals.length} saham untuk tanggal ${signals[0]?.Tanggal || dateFilter.value}`;
    updateSortIcons();
    document.querySelectorAll('.clickable-stock').forEach(el => el.onclick = handleStockClick);
}

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
        
        row.insertCell().innerHTML = `<span class="clickable-stock">${code}</span>`;
        row.insertCell().innerHTML = pf ? `<span class="badge badge-owned">OWNED</span>` : `<span class="badge badge-neutral">WATCH</span>`;
        row.insertCell().textContent = pf ? formatNumber(pf.hargaBeli, false, true) : '-';
        const plCell = row.insertCell();
        if (pf) {
            const pnl = ((item.Penutupan - pf.hargaBeli) / pf.hargaBeli) * 100;
            plCell.className = pnl >= 0 ? 'text-green' : 'text-red';
            plCell.textContent = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
        } else plCell.textContent = '-';
        row.insertCell().textContent = item.Tanggal.slice(5); 
        row.insertCell().textContent = formatNumber(item.Penutupan, false, true);
        row.insertCell().textContent = formatNumber(item.Volume, true);
        const chg = parseFloat(item.Selisih || 0);
        const chgCell = row.insertCell();
        chgCell.className = chg > 0 ? 'text-green' : (chg < 0 ? 'text-red' : '');
        chgCell.textContent = `${chg>0?'+':''}${chg.toFixed(2)}%`;
        row.insertCell().innerHTML = `<span class="${getSignalClass(item[sigKey])}">${item[sigKey]}</span>`;
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

// --- MODAL & CHART ---
async function showStockDetailModal(stockCode) {
    currentModalStockCode = stockCode;
    modalTitle.textContent = `${stockCode} - Detail`;
    updatePortfolioStatusDisplay(stockCode);
    stockDetailModal.style.display = 'flex'; 
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="7">Memuat data...</td></tr>';
    if(priceChart) priceChart.destroy();
    
    try {
        const { data: indicators } = await supabaseClient.from('indikator_teknikal').select('*').eq('Kode Saham', stockCode).order('Tanggal', { ascending: false }).limit(30);
        if(!indicators || !indicators.length) { rawIndicatorTableBody.innerHTML = '<tr><td colspan="7">Data kosong</td></tr>'; return; }
        
        const dates = indicators.map(i => i.Tanggal);
        const { data: prices } = await supabaseClient.from('data_saham').select('"Tanggal Perdagangan Terakhir", "Penutupan"').eq('Kode Saham', stockCode).in('Tanggal Perdagangan Terakhir', dates);
        
        const priceMap = new Map();
        prices?.forEach(p => priceMap.set(p["Tanggal Perdagangan Terakhir"], p.Penutupan));
        
        const histData = indicators.map(i => ({ ...i, Penutupan: priceMap.get(i.Tanggal) })).reverse();
        
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
        });

        const ctx = document.getElementById('priceIndicatorChart').getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: histData.map(d => d.Tanggal.slice(5)),
                datasets: [
                    { label: 'Harga', data: histData.map(d => d.Penutupan), borderColor: '#4f46e5', tension: 0.1, yAxisID: 'y' },
                    { label: 'MA5', data: histData.map(d => d.MA_5), borderColor: '#f43f5e', borderWidth:1, pointRadius:0, yAxisID: 'y' },
                    { label: 'MA20', data: histData.map(d => d.MA_20), borderColor: '#0ea5e9', borderWidth:1, pointRadius:0, yAxisID: 'y' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { position: 'left', grid: { display: false } } },
                plugins: { legend: { labels: { boxWidth: 10 } } }
            }
        });

    } catch (e) { rawIndicatorTableBody.innerHTML = `<tr><td colspan="7">Error: ${e.message}</td></tr>`; }
}

function updatePortfolioStatusDisplay(code) {
    const owned = globalPortfolio.has(code);
    portfolioStatusToggle.className = owned ? 'owned' : '';
    portfolioStatusToggle.textContent = owned ? `OWNED (Hapus)` : 'Tambahkan ke Portofolio';
}
