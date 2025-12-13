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
const csvFileInput = document.getElementById('csvFileInput'); // NEW
const uploadCsvBtn = document.getElementById('uploadCsvBtn'); // NEW
const stockSearchInput = document.getElementById('stockSearch'); // NEW
const suggestionList = document.getElementById('suggestionList'); // NEW

// --- DOM MODAL BARU ---
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const rawIndicatorTableBody = document.querySelector('#rawIndicatorTable tbody');
const ownedCheckbox = document.getElementById('ownedCheckbox'); // NEW
const buyPriceInput = document.getElementById('buyPriceInput'); // NEW
const buyPriceGroup = document.getElementById('buyPriceGroup'); // NEW
const savePortfolioBtn = document.getElementById('savePortfolioBtn'); // NEW
const watchlistStatus = document.getElementById('watchlistStatus'); // NEW

let priceChart = null; // Variabel untuk menyimpan instance Chart.js

// --- GLOBAL STATE ---
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 
let currentModalStockCode = null; // Untuk menyimpan kode saham yang sedang dibuka di modal

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
        // Mengambil juga tanggal beli untuk fitur di masa depan
        const { data, error } = await supabaseClient
            .from('portofolio_saham')
            .select('kode_saham, harga_beli, tanggal_beli'); 
        
        if (error) throw error;
        
        // Simpan data portofolio sebagai Map untuk pencarian cepat (Kode Saham -> { hargaBeli, tanggalBeli })
        globalPortfolio = new Map(data.map(item => [item.kode_saham, { hargaBeli: item.harga_beli, tanggalBeli: item.tanggal_beli }]));
        
        return globalPortfolio;
    } catch (error) {
        console.warn('Info: Tabel portofolio_saham mungkin belum dibuat atau kosong.', error.message);
        return new Map(); 
    }
}

// FUNGSI RPC: Mengambil Sinyal MA Kustom
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


// FUNGSI UNTUK MENGGABUNGKAN DATA STATIS DAN KUSTOM
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

// FUNGSI UTAMA: Mengambil dan Merender Sinyal
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
            globalCombinedSignals = [];
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
// FUNGSI BARU: UPLOAD CSV KE TEMP_SAHAM
// ********************************************

async function handleCsvUpload() {
    if (!csvFileInput.files.length) {
        alert('Silakan pilih file CSV terlebih dahulu.');
        return;
    }
    
    uploadCsvBtn.disabled = true;
    const originalText = uploadCsvBtn.textContent;
    uploadCsvBtn.textContent = 'Processing...';

    const file = csvFileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim() !== '');

        if (lines.length === 0) {
            alert('File CSV kosong.');
            uploadCsvBtn.disabled = false;
            uploadCsvBtn.textContent = originalText;
            return;
        }
        
        // Asumsi baris pertama adalah header
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const dataRows = lines.slice(1);
        const dataToInsert = [];
        
        dataRows.forEach(row => {
            // Memparsing baris CSV (hati-hati dengan koma di dalam nilai)
            const values = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if (values && values.length === headers.length) {
                let rowObject = {};
                headers.forEach((header, index) => {
                    rowObject[header] = values[index].trim().replace(/"/g, '');
                });
                dataToInsert.push(rowObject);
            }
        });
        
        if (dataToInsert.length === 0) {
            alert('Gagal memproses data CSV. Pastikan formatnya benar.');
            uploadCsvBtn.disabled = false;
            uploadCsvBtn.textContent = originalText;
            return;
        }

        try {
            // Menghapus data lama (jika perlu, disarankan menggunakan trigger di Supabase untuk mengurus INSERT/UPDATE data_saham)
            // Namun, karena Anda menggunakan tabel temp_saham dan trigger process_temp_data_bulk, kita hanya perlu INSERT
            
            // Supabase memiliki batas payload, jadi disarankan untuk membagi menjadi batch
            const batchSize = 1000;
            for (let i = 0; i < dataToInsert.length; i += batchSize) {
                const batch = dataToInsert.slice(i, i + batchSize);
                const { error } = await supabaseClient
                    .from('temp_saham')
                    .insert(batch);

                if (error) throw error;
            }

            statusMessage.textContent = `Sukses mengupload ${dataToInsert.length} baris ke temp_saham. Data akan diproses oleh trigger.`;
            alert(`Sukses mengupload ${dataToInsert.length} baris ke temp_saham. Data akan diproses oleh trigger!`);
            
            // Reload sinyal setelah upload, mungkin ada data tanggal baru
            fetchAndRenderSignals(); 

        } catch (error) {
            console.error('Error saat upload ke Supabase:', error);
            statusMessage.textContent = `Gagal menyimpan data: ${error.message}`;
            alert(`Gagal menyimpan data ke Supabase: ${error.message}`);
        } finally {
            uploadCsvBtn.disabled = false;
            uploadCsvBtn.textContent = originalText;
        }
    };

    reader.readAsText(file);
}

// ********************************************
// FUNGSI BARU: PENCARIAN SAHAM
// ********************************************

async function fetchStockSuggestions(query) {
    if (query.length < 2) {
        suggestionList.innerHTML = '';
        return;
    }

    try {
        // Cari di data_saham (membutuhkan tanggal terbaru untuk efisiensi)
        const { data: latestDateData } = await supabaseClient
            .from('data_saham')
            .select('"Tanggal Perdagangan Terakhir"')
            .order('Tanggal Perdagangan Terakhir', { ascending: false })
            .limit(1);
            
        const latestDate = latestDateData ? latestDateData[0]["Tanggal Perdagangan Terakhir"] : null;

        if (!latestDate) return;
        
        // Hanya mencari saham yang memiliki data harga terbaru
        const { data, error } = await supabaseClient
            .from('data_saham')
            .select(`"Kode Saham", "Nama Perusahaan"`)
            .eq('Tanggal Perdagangan Terakhir', latestDate)
            .ilike('Kode Saham', `${query}%`) // Mencari yang dimulai dengan query
            .limit(10); 
            
        if (error) throw error;
        
        renderSuggestions(data);

    } catch (error) {
        console.error('Error fetching suggestions:', error);
        suggestionList.innerHTML = '';
    }
}

function renderSuggestions(suggestions) {
    suggestionList.innerHTML = '';
    
    if (suggestions.length === 0) {
        suggestionList.style.display = 'none';
        return;
    }
    
    suggestions.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item["Kode Saham"]} - ${item["Nama Perusahaan"]}`;
        li.style.padding = '10px';
        li.style.cursor = 'pointer';
        li.style.borderBottom = '1px solid #eee';
        li.setAttribute('data-stock-code', item["Kode Saham"]);
        
        li.addEventListener('click', () => {
            stockSearchInput.value = item["Kode Saham"];
            suggestionList.innerHTML = '';
            suggestionList.style.display = 'none';
            showStockDetailModal(item["Kode Saham"]);
        });
        
        suggestionList.appendChild(li);
    });
    
    suggestionList.style.display = 'block';
}


// ********************************************
// FUNGSI BARU: KONTROL PORTOFOLIO DI MODAL
// ********************************************

function updatePortfolioControl(stockCode) {
    currentModalStockCode = stockCode;
    const isOwned = globalPortfolio.has(stockCode);
    const portfolioData = globalPortfolio.get(stockCode) || {};

    ownedCheckbox.checked = isOwned;
    buyPriceInput.value = isOwned ? portfolioData.hargaBeli || '' : '';
    
    if (isOwned) {
        buyPriceGroup.style.display = 'flex';
        watchlistStatus.style.display = 'none';
    } else {
        buyPriceGroup.style.display = 'none';
        watchlistStatus.style.display = 'block';
        watchlistStatus.textContent = `Saham ini saat ini tidak ada di portofolio (Watchlist).`;
    }
}

async function handleSavePortfolio() {
    const stockCode = currentModalStockCode;
    const isOwned = ownedCheckbox.checked;
    const buyPrice = buyPriceInput.value ? parseFloat(buyPriceInput.value) : null;

    if (!stockCode) return;
    
    savePortfolioBtn.disabled = true;
    savePortfolioBtn.textContent = 'Menyimpan...';

    try {
        if (isOwned && buyPrice > 0) {
            // INSERT atau UPDATE
            const today = new Date().toISOString().split('T')[0];
            const existing = globalPortfolio.get(stockCode);
            
            const dataToUpsert = {
                kode_saham: stockCode,
                harga_beli: buyPrice,
                tanggal_beli: existing ? existing.tanggalBeli : today // Pertahankan tanggal beli jika sudah ada
            };

            const { error: upsertError } = await supabaseClient
                .from('portofolio_saham')
                .upsert(dataToUpsert, { onConflict: 'kode_saham' });

            if (upsertError) throw upsertError;
            
            alert(`Portofolio untuk ${stockCode} disimpan (Harga Beli: ${formatNumber(buyPrice)}).`);

        } else if (!isOwned) {
            // DELETE jika ada di portofolio
            const { error: deleteError } = await supabaseClient
                .from('portofolio_saham')
                .delete()
                .eq('kode_saham', stockCode);
                
            if (deleteError) throw deleteError;
            alert(`Saham ${stockCode} dihapus dari Portofolio.`);
            
        } else if (isOwned && !buyPrice) {
            // User ceklis Owned tapi harga beli kosong
             alert('Harga Beli harus diisi jika "Owned" dicentang.');
             return; // Jangan lanjutkan ke finally
        }

        // Muat ulang portofolio global dan sinyal
        await fetchPortfolio();
        fetchAndRenderSignals(dateFilter.value); 
        updatePortfolioControl(stockCode); // Perbarui tampilan modal

    } catch (error) {
        console.error('Error saving portfolio:', error);
        alert(`Gagal menyimpan portofolio: ${error.message}`);
    } finally {
        savePortfolioBtn.disabled = false;
        savePortfolioBtn.textContent = 'Simpan';
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
    
    // NEW: CSV Upload Handler
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', handleCsvUpload);
    }
    
    // NEW: Stock Search Handler
    if (stockSearchInput) {
        let debounceTimer;
        stockSearchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchStockSuggestions(e.target.value.trim().toUpperCase());
            }, 300);
        });
        // Sembunyikan saran ketika fokus hilang (klik di luar)
        document.addEventListener('click', (e) => {
            if (!document.getElementById('searchContainer').contains(e.target)) {
                suggestionList.style.display = 'none';
            }
        });
    }
    
    // NEW: Portfolio Control Handlers
    if (ownedCheckbox) {
        ownedCheckbox.addEventListener('change', () => {
            if (ownedCheckbox.checked) {
                buyPriceGroup.style.display = 'flex';
                watchlistStatus.style.display = 'none';
            } else {
                buyPriceGroup.style.display = 'none';
                watchlistStatus.style.display = 'block';
                watchlistStatus.textContent = `Saham ini akan dihapus dari Portofolio.`;
            }
        });
    }
    if (savePortfolioBtn) {
        savePortfolioBtn.addEventListener('click', handleSavePortfolio);
    }
    
    setupSorting();
    setupModalHandlers(); 
    
    fetchAndRenderSignals(); 
});


// ********************************************
// FUNGSI PENDUKUNG (Tampilan dan Logika Filter/Sort)
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

function formatNumber(num, isVolume = false) {
    if (num === null || num === undefined) return '-';
    
    const number = parseFloat(num);
    
    if (isVolume) {
        if (number >= 1000000000) return (number / 1000000000).toFixed(2) + ' M';
        if (number >= 1000000) return (number / 1000000).toFixed(2) + ' Jt';
        if (number >= 1000) return (number / 1000).toFixed(1) + ' Rb';
        return number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    }
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
            
            buyPriceCell.textContent = formatNumber(buyPrice); 
            
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
        row.insertCell().textContent = formatNumber(item.Penutupan); 
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
// FUNGSI UTAMA DETAIL SAHAM (FIXED untuk Dual Fetch dan Tambah Portfolio Control)
// ********************************************

async function showStockDetailModal(stockCode) {
    modalTitle.textContent = `Detail Saham ${stockCode}`;
    stockDetailModal.style.display = 'flex';
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Memuat data...</td></tr>';
    
    // Set up portfolio control for this stock
    updatePortfolioControl(stockCode);
    
    if (priceChart) {
        priceChart.destroy();
    }

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
        row.insertCell().textContent = formatNumber(item.Penutupan); 
        row.insertCell().textContent = item.RSI ? parseFloat(item.RSI).toFixed(2) : '-';
        row.insertCell().textContent = item.MACD_Line ? parseFloat(item.MACD_Line).toFixed(2) : '-';
        row.insertCell().textContent = item.Signal_Line ? parseFloat(item.Signal_Line).toFixed(2) : '-';
        row.insertCell().textContent = item.MA_Cepat ? formatNumber(item.MA_Cepat) : '-';
        row.insertCell().textContent = item.MA_Lambat ? formatNumber(item.MA_Lambat) : '-';
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
    
    // 
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
                    label: `MA 5 (${maFastInput.value} Hari)`,
                    data: maFastData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    yAxisID: 'yPrice',
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: `MA 20 (${maSlowInput.value} Hari)`,
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
