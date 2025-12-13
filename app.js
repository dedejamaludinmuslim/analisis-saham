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

// --- ELEMEN DOM FITUR BARU ---
const csvFileInput = document.getElementById('csvFile');
const uploadCsvBtn = document.getElementById('uploadCsvBtn');
const uploadStatus = document.getElementById('uploadStatus');
const stockSearch = document.getElementById('stockSearch');
const searchResults = document.getElementById('searchResults');

// --- DOM MODAL BARU ---
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const rawIndicatorTableBody = document.querySelector('#rawIndicatorTable tbody');
let priceChart = null; // Variabel untuk menyimpan instance Chart.js

// --- Elemen modal baru untuk portfolio ---
const portfolioStatusMessage = document.getElementById('portfolioStatusMessage');
const buyPriceInput = document.getElementById('buyPriceInput');
const buyDateInput = document.getElementById('buyDateInput');
const savePortfolioBtn = document.getElementById('savePortfolioBtn');
const buyPriceContainer = document.getElementById('buyPriceContainer');
const toggleWatchlist = document.getElementById('toggleWatchlist');
const toggleOwned = document.getElementById('toggleOwned');
const watchlistRadio = document.getElementById('watchlistRadio');
const ownedRadio = document.getElementById('ownedRadio');

// --- GLOBAL STATE ---
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 
let currentStockCodeInModal = ''; // Variabel untuk menyimpan kode saham yang sedang dilihat di modal

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
        // Perhatikan: Menggunakan "Tanggal" sesuai skema indikator_teknikal
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
        // Perhatikan: Menggunakan "Tanggal Perdagangan Terakhir" dan "Penutupan" sesuai skema data_saham
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
// FUNGSI UPLOAD CSV KE TEMP_SAHAM
// ********************************************

async function uploadCSV() {
    const file = csvFileInput.files[0];
    if (!file) {
        showUploadStatus('Pilih file CSV terlebih dahulu', 'error');
        return;
    }

    showUploadStatus('Memproses file CSV...', 'info');

    try {
        const text = await file.text();
        const rows = text.split('\n');
        const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Validasi header - sesuaikan dengan struktur temp_saham
        const requiredHeaders = ['Kode Saham', 'Tanggal Perdagangan Terakhir', 'Penutupan'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
            showUploadStatus(`Header yang diperlukan tidak ditemukan: ${missingHeaders.join(', ')}`, 'error');
            return;
        }

        // Parse data
        const data = [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].trim() === '') continue;
            
            const values = rows[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};
            
            // Map semua kolom yang ada di CSV
            headers.forEach((header, index) => {
                let value = values[index] || null;
                
                // Konversi tipe data yang diperlukan
                if (header === 'Tanggal Perdagangan Terakhir' && value) {
                    // Format tanggal: pastikan format YYYY-MM-DD
                    if (value.includes('/')) {
                        const parts = value.split('/');
                        if (parts.length === 3) {
                            value = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                    }
                }
                
                // Konversi nilai numerik
                if (['Penutupan', 'Sebelumnya', 'Open Price', 'First Trade', 'Tertinggi', 'Terendah', 
                     'Selisih', 'Nilai', 'Index Individual', 'Offer', 'Bid', 'Weight For Index', 
                     'Non Regular Value'].includes(header) && value) {
                    value = parseFloat(value.replace(/[^0-9.-]+/g, '')) || null;
                }
                
                // Konversi nilai integer
                if (['No', 'Frekuensi', 'Non Regular Frequency'].includes(header) && value) {
                    value = parseInt(value.replace(/[^0-9]+/g, '')) || null;
                }
                
                // Konversi nilai bigint
                if (['Volume', 'Nilai', 'Offer Volume', 'Bid Volume', 'Listed Shares', 
                     'Tradeble Shares', 'Foreign Sell', 'Foreign Buy', 'Non Regular Volume'].includes(header) && value) {
                    value = parseInt(value.replace(/[^0-9]+/g, '')) || null;
                }
                
                row[header] = value;
            });
            
            data.push(row);
        }

        showUploadStatus(`Mengunggah ${data.length} baris data ke tabel temp_saham...`, 'info');

        // Upload ke tabel temp_saham di Supabase
        const { error } = await supabaseClient
            .from('temp_saham')
            .upsert(data, { 
                onConflict: 'Kode Saham,Tanggal Perdagangan Terakhir',
                ignoreDuplicates: false 
            });

        if (error) throw error;

        showUploadStatus(`✅ Berhasil mengunggah ${data.length} baris data ke temp_saham!`, 'success');
        
        // Tampilkan petunjuk untuk memindahkan ke data_saham
        showUploadStatus(`📋 Gunakan fungsi RPC 'process_temp_saham()' di Supabase untuk memindahkan data ke tabel utama.`, 'info');
        
        // Reset file input
        csvFileInput.value = '';

    } catch (error) {
        console.error('Error uploading CSV:', error);
        showUploadStatus(`❌ Error: ${error.message}`, 'error');
        
        // Cek apakah tabel temp_saham sudah dibuat
        if (error.message.includes('relation "temp_saham" does not exist')) {
            showUploadStatus('⚠️ Tabel temp_saham belum dibuat. Buat tabel terlebih dahulu di Supabase.', 'error');
        }
    }
}

function showUploadStatus(message, type = 'info') {
    uploadStatus.textContent = message;
    uploadStatus.className = 'upload-status';
    uploadStatus.classList.add(`upload-${type}`);
    uploadStatus.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            uploadStatus.style.display = 'none';
        }, 5000);
    }
}

// ********************************************
// FUNGSI PENCARIAN SAHAM
// ********************************************

async function searchStocks(query) {
    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('data_saham')
            .select('"Kode Saham", "Nama Perusahaan"')
            .or(`"Kode Saham".ilike.%${query}%,"Nama Perusahaan".ilike.%${query}%`)
            .order('"Kode Saham"')
            .limit(10);

        if (error) throw error;

        displaySearchResults(data || []);
    } catch (error) {
        console.error('Error searching stocks:', error);
        searchResults.innerHTML = '<div class="search-result-item">Error mencari data</div>';
        searchResults.style.display = 'block';
    }
}

function displaySearchResults(stocks) {
    if (stocks.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item">Tidak ditemukan</div>';
        searchResults.style.display = 'block';
        return;
    }

    searchResults.innerHTML = '';
    stocks.forEach(stock => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <div>
                <span class="search-result-code">${stock['Kode Saham']}</span>
                <br>
                <span class="search-result-name">${stock['Nama Perusahaan'] || '-'}</span>
            </div>
            <div style="font-size: 0.8em; color: #6b7280;">Klik untuk detail</div>
        `;
        
        div.addEventListener('click', () => {
            showStockDetailModal(stock['Kode Saham']);
            stockSearch.value = '';
            searchResults.style.display = 'none';
        });
        
        searchResults.appendChild(div);
    });
    
    searchResults.style.display = 'block';
}

// ********************************************
// FUNGSI PORTFOLIO MANAGEMENT
// ********************************************

async function loadPortfolioStatus(stockCode) {
    try {
        const { data, error } = await supabaseClient
            .from('portofolio_saham')
            .select('*')
            .eq('kode_saham', stockCode)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
        
        // Update UI berdasarkan status portfolio
        if (data) {
            // Saham ada di portfolio
            ownedRadio.checked = true;
            toggleOwned.classList.add('active');
            toggleWatchlist.classList.remove('active');
            
            buyPriceInput.value = data.harga_beli || '';
            buyDateInput.value = data.tanggal_beli || new Date().toISOString().split('T')[0];
            buyPriceContainer.style.display = 'block';
        } else {
            // Saham tidak ada di portfolio
            watchlistRadio.checked = true;
            toggleWatchlist.classList.add('active');
            toggleOwned.classList.remove('active');
            
            buyPriceContainer.style.display = 'none';
        }
        
        portfolioStatusMessage.style.display = 'none';
        
    } catch (error) {
        console.error('Error loading portfolio status:', error);
    }
}

async function savePortfolioStatus(stockCode, status, buyPrice = null, buyDate = null) {
    try {
        let error;
        
        if (status === 'owned' && (!buyPrice || !buyDate)) {
            showPortfolioMessage('Harap isi harga beli dan tanggal', 'error');
            return;
        }
        
        if (status === 'owned') {
            // Insert atau update ke portfolio
            const { error: upsertError } = await supabaseClient
                .from('portofolio_saham')
                .upsert({
                    kode_saham: stockCode,
                    harga_beli: parseFloat(buyPrice),
                    tanggal_beli: buyDate
                }, { onConflict: 'kode_saham' });
            
            error = upsertError;
        } else if (status === 'watchlist') {
            // Hapus dari portfolio (jika ada)
            const { error: deleteError } = await supabaseClient
                .from('portofolio_saham')
                .delete()
                .eq('kode_saham', stockCode);
            
            error = deleteError;
        }
        
        if (error) throw error;
        
        showPortfolioMessage(`✅ Berhasil ${status === 'owned' ? 'menambahkan ke portfolio' : 'menghapus dari portfolio'}`, 'success');
        
        // Refresh portfolio data
        await fetchPortfolio();
        
        // Refresh tampilan utama
        const filterValue = signalFilter.value;
        const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);
        categorizeAndRender(filteredSignals);
        
    } catch (error) {
        console.error('Error saving portfolio:', error);
        showPortfolioMessage(`❌ Error: ${error.message}`, 'error');
    }
}

function showPortfolioMessage(message, type = 'info') {
    portfolioStatusMessage.textContent = message;
    portfolioStatusMessage.className = '';
    portfolioStatusMessage.classList.add(`upload-${type}`);
    portfolioStatusMessage.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            portfolioStatusMessage.style.display = 'none';
        }, 3000);
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
    
    // Event Listeners untuk fitur baru
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', uploadCSV);
    }
    
    if (stockSearch) {
        let searchTimeout;
        stockSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchStocks(e.target.value);
            }, 300);
        });
        
        // Sembunyikan hasil pencarian saat klik di luar
        document.addEventListener('click', (e) => {
            if (!stockSearch.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });
    }
    
    // Portfolio toggle events
    if (toggleWatchlist && toggleOwned) {
        toggleWatchlist.addEventListener('click', () => {
            watchlistRadio.checked = true;
            toggleWatchlist.classList.add('active');
            toggleOwned.classList.remove('active');
            buyPriceContainer.style.display = 'none';
        });
        
        toggleOwned.addEventListener('click', () => {
            ownedRadio.checked = true;
            toggleOwned.classList.add('active');
            toggleWatchlist.classList.remove('active');
            buyPriceContainer.style.display = 'block';
        });
    }
    
    if (savePortfolioBtn) {
        savePortfolioBtn.addEventListener('click', async () => {
            const status = document.querySelector('input[name="portfolioStatus"]:checked')?.value;
            
            if (!status) {
                showPortfolioMessage('Pilih status terlebih dahulu', 'error');
                return;
            }
            
            const buyPrice = buyPriceInput.value;
            const buyDate = buyDateInput.value;
            
            await savePortfolioStatus(currentStockCodeInModal, status, buyPrice, buyDate);
        });
    }
    
    // Set tanggal default untuk input tanggal beli
    if (buyDateInput) {
        buyDateInput.value = new Date().toISOString().split('T')[0];
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
// FUNGSI UTAMA DETAIL SAHAM
// ********************************************

async function showStockDetailModal(stockCode) {
    currentStockCodeInModal = stockCode;
    modalTitle.textContent = `Detail Saham ${stockCode}`;
    stockDetailModal.style.display = 'flex';
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Memuat data...</td></tr>';
    
    if (priceChart) {
        priceChart.destroy();
    }
    
    // Reset form portfolio
    portfolioStatusMessage.style.display = 'none';
    buyPriceContainer.style.display = 'none';
    watchlistRadio.checked = false;
    ownedRadio.checked = false;
    toggleWatchlist.classList.remove('active');
    toggleOwned.classList.remove('active');

    try {
        // Load portfolio status terlebih dahulu
        await loadPortfolioStatus(stockCode);
        
        // 1. Ambil data INDIKATOR (Tanpa Harga)
        const { data: indicatorData, error: indicatorError } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`"Tanggal", "RSI", "MACD_Line", "Signal_Line", "MA_5", "MA_20"`)
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
