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
// PENAMBAHAN: Elemen Pencarian
const stockSearchInput = document.getElementById('stockSearchInput');
const stockSearchResults = document.getElementById('stockSearchResults');

// --- DOM MODAL BARU ---
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const rawIndicatorTableBody = document.querySelector('#rawIndicatorTable tbody');
// PENAMBAHAN: Tombol Portfolio Status
const portfolioStatusToggle = document.getElementById('portfolioStatusToggle');
let priceChart = null; // Variabel untuk menyimpan instance Chart.js

// --- GLOBAL STATE ---
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 
let currentModalStockCode = null; // Menyimpan kode saham yang sedang dibuka

// Mendapatkan elemen tabel dan status untuk setiap kategori 
const categories = {
    maCross: { tableBody: document.querySelector('#maCrossTable tbody'), statusEl: document.getElementById('maStatus'), tableEl: document.getElementById('maCrossTable') },
    rsi: { tableBody: document.querySelector('#rsiTable tbody'), statusEl: document.getElementById('rsiStatus'), tableEl: document.getElementById('rsiTable') },
    macd: { tableBody: document.querySelector('#macdTable tbody'), statusEl: document.getElementById('macdStatus'), tableEl: document.getElementById('macdTable') },
    volume: { tableBody: document.querySelector('#volumeTable tbody'), statusEl: document.getElementById('volumeStatus'), tableEl: document.getElementById('volumeTable') }
};

// ********************************************
// FUNGSI UTAMA DAN LOGIKA SUPABASE
// ********************************************

// FUNGSI: Mengambil semua kode saham yang dimiliki
async function fetchPortfolio() {
    try {
        // Mengambil kode_saham dan harga_beli dari portofolio_saham
        const { data, error } = await supabaseClient
            .from('portofolio_saham')
            .select('kode_saham, harga_beli'); 
        
        if (error) throw error;
        
        // Simpan data portofolio sebagai Map untuk pencarian cepat (Kode Saham -> { hargaBeli })
        globalPortfolio = new Map(data.map(item => [item.kode_saham, { hargaBeli: item.harga_beli }]));
        
        return globalPortfolio;
    } catch (error) {
        // Jika tabel belum ada, kita abaikan saja agar aplikasi tetap berjalan
        console.warn('Info: Tabel portofolio_saham mungkin belum dibuat atau kosong.', error.message);
        return new Map(); 
    }
}

// FUNGSI BARU: Mengubah Status Portofolio
async function togglePortfolioStatus(stockCode, currentIsOwned) {
    if (currentIsOwned) {
        // Hapus dari Portofolio (menjadi Watchlist)
        try {
            const { error } = await supabaseClient
                .from('portofolio_saham')
                .delete()
                .eq('kode_saham', stockCode);
            
            if (error) throw error;
            
            globalPortfolio.delete(stockCode);
            alert(`${stockCode} dihapus dari Portofolio (menjadi Watchlist).`);
        } catch (error) {
            console.error('Error menghapus dari portofolio:', error);
            alert(`Gagal menghapus ${stockCode} dari portofolio: ${error.message}`);
            return false;
        }
    } else {
        // Tambahkan ke Portofolio (menjadi Owned)
        // Kita perlu harga beli. Karena tidak ada input, kita gunakan harga Penutupan terbaru
        const latestPrice = await getLatestStockPrice(stockCode);
        const latestDate = dateFilter.value; // Ambil tanggal dari filter
        
        if (latestPrice === null) {
            alert(`Gagal mendapatkan harga Penutupan terbaru untuk ${stockCode}.`);
            return false;
        }
        
        const confirmPrice = prompt(`Masukkan Harga Beli untuk ${stockCode} (Harga Close terakhir: ${formatNumber(latestPrice, false, true)}):`, latestPrice);
        
        if (confirmPrice === null || isNaN(parseFloat(confirmPrice)) || parseFloat(confirmPrice) <= 0) {
            alert('Pembelian dibatalkan atau Harga Beli tidak valid.');
            return false;
        }
        
        const buyPrice = parseFloat(confirmPrice);
        
        try {
            // Coba masukkan data (dengan asumsi 'kode_saham' adalah unique key)
            const { error } = await supabaseClient
                .from('portofolio_saham')
                .upsert(
                    { kode_saham: stockCode, harga_beli: buyPrice, tanggal_beli: latestDate }, 
                    { onConflict: 'kode_saham' }
                );
            
            if (error) throw error;
            
            globalPortfolio.set(stockCode, { hargaBeli: buyPrice });
            alert(`${stockCode} berhasil ditambahkan ke Portofolio dengan Harga Beli ${formatNumber(buyPrice, false, true)}.`);
        } catch (error) {
            console.error('Error menambahkan ke portofolio:', error);
            alert(`Gagal menambahkan ${stockCode} ke portofolio: ${error.message}`);
            return false;
        }
    }
    
    // Refresh Tampilan (jika modal masih terbuka)
    await fetchPortfolio();
    if (currentModalStockCode === stockCode) {
        updatePortfolioStatusDisplay(stockCode);
    }
    // Render ulang tabel utama agar kolom Status dan P/L terupdate
    const filterValue = signalFilter.value;
    const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);
    categorizeAndRender(filteredSignals);
    
    return true;
}

// FUNGSI BARU: Mengambil Harga Penutupan Terakhir
async function getLatestStockPrice(stockCode) {
     const targetDate = dateFilter.value;
     
     try {
         const { data, error } = await supabaseClient
            .from('data_saham')
            .select(`"Penutupan"`)
            .eq('Kode Saham', stockCode)
            .eq('Tanggal Perdagangan Terakhir', targetDate)
            .limit(1);
            
        if (error) throw error;
        
        return data && data.length > 0 ? data[0].Penutupan : null;
     } catch (error) {
         console.error('Error mengambil harga penutupan:', error);
         return null;
     }
}

// FUNGSI RPC: Mengambil Sinyal MA Kustom (Tidak Berubah)
async function fetchCustomMASignals(targetDate, maFast, maSlow) {
    statusMessage.textContent = `Memproses sinyal MA Kustom (${maFast}/${maSlow}) untuk ${targetDate}...`;
    globalCustomMASignals = []; 

    try {
        const { data, error } = await supabaseClient.rpc('get_custom_ma_signals', {
            ma_fast_period: parseInt(maFast),
            ma_slow_period: parseInt(maSlow),
            target_date: targetDate
        });
        
        if (error) throw error;

        globalCustomMASignals = data; 
        return data;

    } catch (error) {
        console.error('Error saat memanggil RPC MA Kustom:', error);
        statusMessage.textContent = `Error kustom MA: ${error.message}. Pastikan fungsi RPC sudah dibuat di Supabase.`;
        return [];
    }
}


// FUNGSI UNTUK MENGGABUNGKAN DATA STATIS DAN KUSTOM (Tidak Berubah)
function mergeSignals(staticSignals, customMASignals) {
    const mergedMap = new Map();

    // 1. Masukkan semua data statis (sinyal non-MA)
    staticSignals.forEach(s => {
        const isMASignalOnly = s.Sinyal_MA && !s.Sinyal_RSI && !s.Sinyal_MACD && !s.Sinyal_Volume;
        if (!isMASignalOnly) {
            mergedMap.set(s["Kode Saham"], { ...s });
        }
    });

    // 2. Overwrite/Tambah dengan data MA Kustom
    customMASignals.forEach(cs => {
        const existing = mergedMap.get(cs["Kode Saham"]) || {};
        
        mergedMap.set(cs["Kode Saham"], {
            ...existing, 
            ...cs,       
            Penutupan: cs.Close || cs.Penutupan, // Handle kemungkinan nama kolom dari RPC
            Volume: cs.Volume,
            Selisih: cs.Selisih,
            Sinyal_MA: cs.Sinyal_MA 
        });
    });

    return Array.from(mergedMap.values()).filter(item => 
        item.Sinyal_MA || item.Sinyal_RSI || item.Sinyal_MACD || item.Sinyal_Volume
    );
}

// FUNGSI UTAMA: Mengambil dan Merender Sinyal (Tidak Berubah Signifikan)
async function fetchAndRenderSignals(selectedDate = null) {
    statusMessage.textContent = 'Memuat data...';
    applyMaCustomButton.disabled = true;

    try {
        // 1. Ambil data Portofolio
        await fetchPortfolio(); 
        
        // 2. Kueri data Sinyal dari indikator_teknikal
        let signalQuery = supabaseClient 
            .from('indikator_teknikal')
            .select(`"Kode Saham", "Tanggal", "Sinyal_MA", "Sinyal_RSI", "Sinyal_MACD", "Sinyal_Volume"`)
            .order('Tanggal', { ascending: false });
            
        if (selectedDate) {
            signalQuery = signalQuery.eq('Tanggal', selectedDate);
        } else {
            signalQuery = signalQuery.limit(100);
        }

        const { data: signalData, error: signalError } = await signalQuery;

        if (signalError) throw signalError;
        if (!signalData || signalData.length === 0) {
            statusMessage.textContent = 'Tidak ada data sinyal ditemukan.';
            return;
        }

        const dateToFilter = selectedDate || signalData[0].Tanggal;

        if (!selectedDate) {
            await populateDateFilter(dateToFilter);
            dateFilter.value = dateToFilter;
        }
        
        // 3. Kueri Data Fundamental dari data_saham
        statusMessage.textContent = `Mengambil data harga untuk tanggal ${dateToFilter}...`;
        const { data: fundamentalData, error: fundamentalError } = await supabaseClient
            .from('data_saham')
            .select(`"Kode Saham", "Penutupan", "Volume", "Selisih", "Tanggal Perdagangan Terakhir"`)
            .eq('Tanggal Perdagangan Terakhir', dateToFilter);

        if (fundamentalError) throw fundamentalError;

        // Map data fundamental untuk akses cepat
        const fundamentalMap = {};
        if (fundamentalData) {
            fundamentalData.forEach(item => {
                const key = item["Kode Saham"];
                fundamentalMap[key] = {
                    Penutupan: item.Penutupan, 
                    Volume: item.Volume,
                    Selisih: item.Selisih
                };
            });
        }
        
        // 4. Gabungkan Sinyal + Fundamental
        const staticCombinedSignals = [];
        signalData.filter(s => s.Tanggal === dateToFilter).forEach(s => {
            const fundamental = fundamentalMap[s["Kode Saham"]];
            if (fundamental) {
                staticCombinedSignals.push({
                    ...s,
                    ...fundamental 
                });
            }
        });
        
        // 5. Terapkan MA Kustom (jika ada)
        let finalSignals;
        if (globalCustomMASignals.length > 0 && dateToFilter === globalCustomMASignals[0].Tanggal) {
            finalSignals = mergeSignals(staticCombinedSignals, globalCustomMASignals);
            statusMessage.textContent = 'Sinyal MA Kustom berhasil digabungkan.';
        } else {
            finalSignals = staticCombinedSignals.filter(s => 
                s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume
            );
        }
        
        if (finalSignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal terdeteksi pada tanggal ${dateToFilter} dengan data harga lengkap.`;
            Object.values(categories).forEach(({ tableEl }) => tableEl.style.display = 'none');
            Object.values(categories).forEach(({ statusEl }) => statusEl.style.display = 'block');
            return;
        }
        
        globalCombinedSignals = finalSignals;
        
        const filterValue = signalFilter.value;
        const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);

        if (!selectedDate) {
             sortState = { column: 'Kode Saham', direction: 'asc' };
        }
       
        categorizeAndRender(filteredSignals);

    } catch (error) {
        statusMessage.textContent = `Error: ${error.message}`;
        console.error('Error fetching data:', error);
    } finally {
        applyMaCustomButton.disabled = false;
    }
}


// ********************************************
// SETUP EVENT LISTENERS
// ********************************************

document.addEventListener('DOMContentLoaded', () => {
    
    if (dateFilter) { 
        dateFilter.addEventListener('change', () => {
            const selectedDate = dateFilter.value;
            globalCustomMASignals = []; 
            fetchAndRenderSignals(selectedDate);
        });
    }
    
    if (signalFilter) {
        signalFilter.addEventListener('change', () => {
            const filterValue = signalFilter.value;
            const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);
            categorizeAndRender(filteredSignals); 
        });
    }

    if (applyMaCustomButton && maFastInput && maSlowInput) {
        applyMaCustomButton.addEventListener('click', async () => {
            const maFast = maFastInput.value;
            const maSlow = maSlowInput.value;
            const selectedDate = dateFilter.value;

            if (parseInt(maFast) >= parseInt(maSlow)) {
                alert('Periode MA Cepat harus lebih kecil dari Periode MA Lambat.');
                return;
            }

            await fetchCustomMASignals(selectedDate, maFast, maSlow);
            fetchAndRenderSignals(selectedDate);
        });
    }
    
    setupSorting();
    setupModalHandlers(); 
    setupSearchHandlers(); // PENAMBAHAN: Setup handler pencarian
    
    fetchAndRenderSignals(); 
});


// ********************************************
// FUNGSI BARU: LOGIKA PENCARIAN
// ********************************************

async function searchStocks(query) {
    if (query.length < 2) {
        stockSearchResults.style.display = 'none';
        return [];
    }
    
    // Kueri Supabase: Cari kode saham yang diawali dengan query
    try {
        const { data, error } = await supabaseClient
            .from('data_saham')
            .select(`"Kode Saham", "Nama Perusahaan"`)
            .ilike('Kode Saham', `${query}%`) // ILIKE untuk pencarian tidak sensitif huruf besar/kecil
            .limit(10); 
            
        if (error) throw error;
        
        return data.map(item => ({
            code: item["Kode Saham"],
            name: item["Nama Perusahaan"] || 'N/A'
        }));

    } catch (error) {
        console.error('Error mencari saham:', error);
        return [];
    }
}

function renderSearchResults(results) {
    stockSearchResults.innerHTML = '';
    
    if (results.length === 0) {
        stockSearchResults.style.display = 'none';
        return;
    }
    
    results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `<span class="search-result-code">${item.code}</span> <span class="search-result-name">${item.name}</span>`;
        div.dataset.stockCode = item.code;
        
        div.addEventListener('click', () => {
            showStockDetailModal(item.code);
            stockSearchInput.value = '';
            stockSearchResults.style.display = 'none';
        });
        
        stockSearchResults.appendChild(div);
    });
    
    stockSearchResults.style.display = 'block';
}

function setupSearchHandlers() {
    let searchTimeout;
    
    stockSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim().toUpperCase();
        
        searchTimeout = setTimeout(async () => {
            const results = await searchStocks(query);
            renderSearchResults(results);
        }, 300); // Debounce 300ms
    });
    
    // Sembunyikan hasil ketika mengklik di luar
    document.addEventListener('click', (e) => {
        if (!stockSearchContainer.contains(e.target)) {
            stockSearchResults.style.display = 'none';
        }
    });
    
    stockSearchInput.addEventListener('focus', () => {
        // Tampilkan hasil jika input tidak kosong
        if (stockSearchResults.children.length > 0 && stockSearchInput.value.length >= 2) {
            stockSearchResults.style.display = 'block';
        }
    });
}


// ********************************************
// FUNGSI PENDUKUNG (Tampilan dan Logika Filter/Sort) - (Format Number diubah)
// ********************************************

async function populateDateFilter(latestDate) {
    if (!dateFilter) return; 
    statusMessage.textContent = 'Memuat daftar tanggal yang tersedia...';

    try {
        const { data, error } = await supabaseClient
            .from('indikator_teknikal')
            .select('Tanggal')
            .order('Tanggal', { ascending: false })
            .limit(30); 

        if (error) throw error;

        const uniqueDates = [...new Set(data.map(item => item.Tanggal))];
        
        dateFilter.innerHTML = '';
        uniqueDates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = date;
            if (date === latestDate) {
                option.textContent += ' (Terbaru)';
            }
            dateFilter.appendChild(option);
        });

        dateFilter.disabled = false;
        
    } catch (error) {
        console.error('Error memuat tanggal:', error);
        dateFilter.innerHTML = '<option>Gagal Memuat Tanggal</option>';
    }
}

function getSignalClass(signal) {
    if (!signal) return '';
    if (signal.includes('BUY') || signal.includes('OVERSOLD') || signal.includes('GOLDEN')) return 'signal-buy';
    if (signal.includes('SELL') || signal.includes('OVERBOUGHT') || signal.includes('DEAD')) return 'signal-sell';
    if (signal.includes('WATCH') || signal.includes('SPIKE')) return 'signal-watch';
    return '';
}

// Perubahan: Menambahkan argumen isRawPrice untuk harga beli/penutupan
function formatNumber(num, isVolume = false, isRawPrice = false) { 
    if (num === null || num === undefined) return '-';
    
    const number = parseFloat(num);
    
    if (isVolume) {
        if (number >= 1000000000) return (number / 1000000000).toFixed(2) + ' M';
        if (number >= 1000000) return (number / 1000000).toFixed(2) + ' Jt';
        if (number >= 1000) return (number / 1000).toFixed(1) + ' Rb';
        return number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    }
    
    // Jika harga mentah (tanpa IDR) atau jika Penutupan/Harga Beli
    if (isRawPrice) { 
        return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number);
    }
    
    // Default: format Rupiah
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number);
}


function applySignalFilter(signals, filterType) {
    if (filterType === 'ALL') {
        return signals;
    }
    
    const filtered = signals.filter(item => {
        const allSignals = [item.Sinyal_MA, item.Sinyal_RSI, item.Sinyal_MACD, item.Sinyal_Volume].filter(s => s);
        const combinedSignalText = allSignals.join(' ').toUpperCase();

        if (filterType === 'BUY') {
            return combinedSignalText.includes('BUY') || combinedSignalText.includes('OVERSOLD') || combinedSignalText.includes('GOLDEN');
        } else if (filterType === 'SELL') {
            return combinedSignalText.includes('SELL') || combinedSignalText.includes('OVERBOUGHT') || combinedSignalText.includes('DEAD');
        } else if (filterType === 'WATCH') {
            return combinedSignalText.includes('WATCH') || combinedSignalText.includes('SPIKE');
        }
        return false;
    });

    return filtered;
}

function sortSignals(signals, column, direction) {
    const isNumeric = ['Penutupan', 'Volume', 'Selisih', 'Untung/Rugi'].includes(column);

    return signals.sort((a, b) => {
        let valA, valB;

        // Penanganan khusus untuk Untung/Rugi (P/L)
        if (column === 'Untung/Rugi') {
            const portfolioA = globalPortfolio.get(a["Kode Saham"]) || {};
            const portfolioB = globalPortfolio.get(b["Kode Saham"]) || {};
            
            const buyPriceA = parseFloat(portfolioA.hargaBeli) || 0;
            const buyPriceB = parseFloat(portfolioB.hargaBeli) || 0;

            valA = buyPriceA > 0 ? ((a.Penutupan - buyPriceA) / buyPriceA) * 100 : 0;
            valB = buyPriceB > 0 ? ((b.Penutupan - buyPriceB) / buyPriceB) * 100 : 0;

        } else {
            valA = a[column];
            valB = b[column];
        }
        
        if (isNumeric) {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
        } else if (column === 'Kode Saham' || column === 'Tanggal') {
            valA = String(valA);
            valB = String(valB);
        }
        
        let comparison = 0;
        if (valA > valB) {
            comparison = 1;
        } else if (valA < valB) {
            comparison = -1;
        }

        return direction === 'asc' ? comparison : comparison * -1;
    });
}

function categorizeAndRender(signals) {
    const sortedSignals = sortSignals([...signals], sortState.column, sortState.direction);

    const categorized = { maCross: [], rsi: [], macd: [], volume: [] };

    sortedSignals.forEach(item => {
        if (!item.Penutupan) return; 

        if (item.Sinyal_MA) categorized.maCross.push(item);
        if (item.Sinyal_RSI) categorized.rsi.push(item);
        if (item.Sinyal_MACD) categorized.macd.push(item);
        if (item.Sinyal_Volume) categorized.volume.push(item);
    });
    
    renderCategory('maCross', categorized.maCross);
    renderCategory('rsi', categorized.rsi);
    renderCategory('volume', categorized.volume);
    renderCategory('macd', categorized.macd);
    
    let totalStocks = signals.length;
    let totalSignals = Object.values(categorized).flat().length;
    const date = signals.length > 0 ? signals[0].Tanggal : dateFilter.value;
    statusMessage.textContent = `Sinyal untuk ${totalStocks} saham terdeteksi pada ${date} (Setelah Filter). Total ${totalSignals} Sinyal.`;
    
    updateSortIcons();
    setupStockClickHandlers(); 
}

function renderCategory(categoryKey, data) {
    const { tableBody, statusEl, tableEl } = categories[categoryKey];
    const signalKey = `Sinyal_${categoryKey.replace('maCross', 'MA').replace('rsi', 'RSI').replace('macd', 'MACD').replace('volume', 'Volume')}`;
    
    tableBody.innerHTML = '';
    
    if (data.length === 0) {
        statusEl.style.display = 'block';
        tableEl.style.display = 'none';
        return;
    }

    statusEl.style.display = 'none';
    tableEl.style.display = 'table'; 

    data.forEach(item => {
        const row = tableBody.insertRow();
        
        const stockCode = item["Kode Saham"];
        const isOwned = globalPortfolio.has(stockCode); 
        const portfolioData = globalPortfolio.get(stockCode) || {}; 
        
        // Kolom 1: Kode Saham
        const codeCell = row.insertCell();
        codeCell.textContent = stockCode;
        codeCell.classList.add('clickable-stock'); 

        // Kolom 2: Status
        const statusCell = row.insertCell(); 
        if (isOwned) {
            statusCell.innerHTML = `<span style="background-color: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 4px; font-weight: 600;">OWNED</span>`;
        } else {
            statusCell.innerHTML = `<span style="background-color: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 4px;">WATCHLIST</span>`;
        }
        
        // Kolom 3: Harga Beli
        const buyPriceCell = row.insertCell(); 
        
        // Kolom 4: P/L (%)
        const profitLossCell = row.insertCell();

        if (isOwned && portfolioData.hargaBeli) {
            const currentPrice = item.Penutupan; 
            const buyPrice = parseFloat(portfolioData.hargaBeli);
            
            buyPriceCell.textContent = formatNumber(buyPrice, false, true); // Menggunakan formatNumber baru
            
            const pnl = ((currentPrice - buyPrice) / buyPrice) * 100;
            
            profitLossCell.textContent = `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`;
            profitLossCell.style.fontWeight = 'bold';
            
            if (pnl > 0) {
                profitLossCell.style.color = 'var(--buy-color)'; 
            } else if (pnl < 0) {
                profitLossCell.style.color = 'var(--sell-color)'; 
            }
        } else {
            buyPriceCell.textContent = '-';
            profitLossCell.textContent = '-';
        }

        // Kolom 5: Tanggal
        row.insertCell().textContent = item["Tanggal"];
        // Kolom 6: Penutupan
        row.insertCell().textContent = formatNumber(item.Penutupan, false, true); // Menggunakan formatNumber baru
        // Kolom 7: Volume
        row.insertCell().textContent = formatNumber(item.Volume, true);
        
        // Kolom 8: Perubahan
        const percentChange = item.Selisih ? parseFloat(item.Selisih) : 0;
        const changeDailyCell = row.insertCell();
        changeDailyCell.textContent = `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`;
        changeDailyCell.style.fontWeight = 'bold';
        if (percentChange > 0) {
            changeDailyCell.style.color = 'var(--buy-color)'; 
        } else if (percentChange < 0) {
            changeDailyCell.style.color = 'var(--sell-color)'; 
        } else {
            changeDailyCell.style.color = 'var(--text-color)'; 
        }

        // Kolom 9: Sinyal
        const signalCell = row.insertCell();
        const signalText = item[signalKey];
        const signalSpan = document.createElement('span'); 
        signalSpan.textContent = signalText;
        signalSpan.className = getSignalClass(signalText); 
        signalCell.appendChild(signalSpan);
    });
}

function setupSorting() {
    document.querySelectorAll('.signal-category th[data-column]').forEach(header => {
        header.addEventListener('click', function() {
            const column = this.getAttribute('data-column');
            let direction = 'asc';

            if (sortState.column === column) {
                direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            }

            sortState.column = column;
            sortState.direction = direction;

            const filterValue = signalFilter.value;
            const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);
            categorizeAndRender(filteredSignals);
        });
    });
}

function updateSortIcons() {
    document.querySelectorAll('.signal-category th[data-column]').forEach(header => {
        const column = header.getAttribute('data-column');
        const icon = header.querySelector('.sort-icon');
        if (!icon) return; 
        
        icon.textContent = '↕';
        icon.classList.remove('active');

        if (column === sortState.column) {
            icon.textContent = sortState.direction === 'asc' ? '↑' : '↓';
            icon.classList.add('active');
        }
    });
}

function setupModalHandlers() {
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (stockDetailModal) stockDetailModal.style.display = 'none';
        });
        stockDetailModal.addEventListener('click', (e) => {
            if (e.target === stockDetailModal) {
                stockDetailModal.style.display = 'none';
            }
        });
    }
    
    // PENAMBAHAN: Handler untuk Toggle Status Portfolio
    if (portfolioStatusToggle) {
        portfolioStatusToggle.addEventListener('click', async () => {
            const isOwned = portfolioStatusToggle.classList.contains('owned');
            const success = await togglePortfolioStatus(currentModalStockCode, isOwned);
            // Status tampilan akan diperbarui di dalam togglePortfolioStatus
        });
    }
}

function setupStockClickHandlers() {
    document.querySelectorAll('.clickable-stock').forEach(cell => {
        cell.removeEventListener('click', handleStockClick);
        cell.addEventListener('click', handleStockClick);
    });
}

function handleStockClick(event) {
    const stockCode = event.currentTarget.textContent.trim();
    showStockDetailModal(stockCode);
}


// ********************************************
// FUNGSI UTAMA DETAIL SAHAM (Diperbarui untuk Handle Portfolio Toggle)
// ********************************************

function updatePortfolioStatusDisplay(stockCode) {
    const isOwned = globalPortfolio.has(stockCode);
    const buyData = globalPortfolio.get(stockCode);
    
    portfolioStatusToggle.classList.remove('owned');
    portfolioStatusToggle.textContent = 'Tambahkan ke Portfolio (Owned)';

    if (isOwned) {
        portfolioStatusToggle.classList.add('owned');
        const buyPriceText = buyData && buyData.hargaBeli ? formatNumber(buyData.hargaBeli, false, true) : 'N/A';
        portfolioStatusToggle.textContent = `OWNED (Hapus / Harga Beli: ${buyPriceText})`;
    } else {
        portfolioStatusToggle.textContent = 'Tambahkan ke Portfolio (Owned)';
    }
}

async function showStockDetailModal(stockCode) {
    currentModalStockCode = stockCode; // Simpan kode saham saat ini
    modalTitle.textContent = `Detail Saham ${stockCode}`;
    stockDetailModal.style.display = 'flex';
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Memuat data...</td></tr>';
    
    if (priceChart) {
        priceChart.destroy();
    }
    
    // PERBARUI DISPLAY STATUS SAHAM SAAT MODAL DIBUKA
    updatePortfolioStatusDisplay(stockCode);

    try {
        // 1. Ambil data INDIKATOR (Tanpa Harga)
        const { data: indicatorData, error: indicatorError } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`
                "Tanggal",
                "RSI", 
                "MACD_Line", 
                "Signal_Line", 
                "MA_5", 
                "MA_20"
            `)
            .eq('Kode Saham', stockCode)
            .order('Tanggal', { ascending: false })
            .limit(30); 

        if (indicatorError) throw indicatorError;
        
        if (!indicatorData || indicatorData.length === 0) {
             rawIndicatorTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Tidak ada data indikator ditemukan.</td></tr>';
             return;
        }

        // 2. Ambil data HARGA (Penutupan) dari data_saham
        const dates = indicatorData.map(item => item.Tanggal);
        
        const { data: priceData, error: priceError } = await supabaseClient
            .from('data_saham')
            .select(`"Tanggal Perdagangan Terakhir", "Penutupan"`)
            .eq('Kode Saham', stockCode)
            .in('Tanggal Perdagangan Terakhir', dates);
            
        if (priceError) throw priceError;

        // Map data harga untuk lookup cepat berdasarkan tanggal
        const priceMap = new Map();
        if(priceData) {
            priceData.forEach(p => {
                priceMap.set(p["Tanggal Perdagangan Terakhir"], p.Penutupan);
            });
        }
        
        // 3. Gabungkan Data (Merge)
        const historicalData = indicatorData.map(ind => ({
            Tanggal: ind.Tanggal,
            Penutupan: priceMap.get(ind.Tanggal) || null, // Ambil harga dari map, null jika tidak ada
            RSI: ind.RSI,
            MACD_Line: ind.MACD_Line,
            Signal_Line: ind.Signal_Line,
            MA_Cepat: ind.MA_5, // Mapping ke MA Cepat
            MA_Lambat: ind.MA_20 // Mapping ke MA Lambat
        })).reverse(); // Balikkan agar urut kronologis untuk chart

        renderRawIndicatorTable(historicalData);
        renderPriceIndicatorChart(stockCode, historicalData);

    } catch (err) {
        console.error("Error memuat detail saham:", err);
        rawIndicatorTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Error: ${err.message}.</td></tr>`;
    }
}

function renderRawIndicatorTable(data) {
    rawIndicatorTableBody.innerHTML = '';
    // Data di-reverse lagi untuk tampilan tabel (terbaru di atas)
    data.slice().reverse().forEach(item => { 
        const row = rawIndicatorTableBody.insertRow();
        row.style.borderBottom = '1px solid #eee';
        
        row.insertCell().textContent = item.Tanggal;
        row.insertCell().textContent = formatNumber(item.Penutupan, false, true); // Raw Price
        row.insertCell().textContent = item.RSI ? parseFloat(item.RSI).toFixed(2) : '-';
        row.insertCell().textContent = item.MACD_Line ? parseFloat(item.MACD_Line).toFixed(2) : '-';
        row.insertCell().textContent = item.Signal_Line ? parseFloat(item.Signal_Line).toFixed(2) : '-';
        row.insertCell().textContent = item.MA_Cepat ? formatNumber(item.MA_Cepat, false, true) : '-'; // Raw Price
        row.insertCell().textContent = item.MA_Lambat ? formatNumber(item.MA_Lambat, false, true) : '-'; // Raw Price
    });
}

function renderPriceIndicatorChart(stockCode, data) {
    const ctx = document.getElementById('priceIndicatorChart').getContext('2d');
    
    const labels = data.map(item => item.Tanggal); 
    const priceData = data.map(item => item.Penutupan);
    const maFastData = data.map(item => item.MA_Cepat);
    const maSlowData = data.map(item => item.MA_Lambat);
    const rsiData = data.map(item => item.RSI);
    const macdData = data.map(item => item.MACD_Line);
    const signalData = data.map(item => item.Signal_Line);

    if (priceChart) {
        priceChart.destroy();
    }

    priceChart = new Chart(ctx, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Harga Penutupan (IDR)',
                    data: priceData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    yAxisID: 'yPrice',
                    tension: 0.1,
                    pointRadius: 2
                },
                {
                    label: `MA ${maFastInput.value} Hari`,
                    data: maFastData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    yAxisID: 'yPrice',
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: `MA ${maSlowInput.value} Hari`,
                    data: maSlowData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    yAxisID: 'yPrice',
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: 'RSI',
                    data: rsiData,
                    borderColor: 'rgba(255, 206, 86, 1)',
                    yAxisID: 'yRSI',
                    tension: 0.2,
                    borderWidth: 1,
                    pointRadius: 1,
                    hidden: true 
                },
                {
                    label: 'MACD Line',
                    data: macdData,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    yAxisID: 'yRSI',
                    tension: 0.2,
                    borderWidth: 1,
                    pointRadius: 1,
                    hidden: true 
                },
                 {
                    label: 'Signal Line',
                    data: signalData,
                    borderColor: 'rgba(255, 159, 64, 1)',
                    yAxisID: 'yRSI',
                    tension: 0.2,
                    borderWidth: 1,
                    pointRadius: 1,
                    hidden: true 
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Tanggal' } },
                yPrice: { 
                    type: 'linear', display: 'auto', position: 'left', 
                    title: { display: true, text: 'Harga (IDR)' }
                },
                yRSI: { 
                    type: 'linear', display: 'auto', position: 'right', 
                    title: { display: true, text: 'Indikator (RSI/MACD)' },
                    grid: { drawOnChartArea: false },
                    min: -50, max: 100 
                }
            },
            plugins: {
                tooltip: { mode: 'index', intersect: false },
                legend: { display: true }
            }
        }
    });
}
