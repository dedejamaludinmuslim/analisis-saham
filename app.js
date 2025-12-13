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
const mainTableBody = document.querySelector('#mainTable tbody'); // Tambahkan ini jika tabel utama bernama mainTable

// --- DOM UNTUK FITUR BARU (SEARCH, UPLOAD, PORTOFOLIO) ---
const stockSearchInput = document.getElementById('stockSearchInput');
const searchResults = document.getElementById('searchResults');
const btnUploadCsv = document.getElementById('btnUploadCsv');
const csvFileInput = document.getElementById('csvFileInput');

// DOM MODAL
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const rawIndicatorTableBody = document.querySelector('#rawIndicatorTable tbody');
let priceChart = null; // Variabel untuk menyimpan instance Chart.js

// Portfolio Form Elements
const chkOwned = document.getElementById('chkOwned');
const portfolioInputs = document.getElementById('portfolioInputs');
const inputBuyDate = document.getElementById('inputBuyDate');
const inputBuyPrice = document.getElementById('inputBuyPrice');
const btnSavePortfolio = document.getElementById('btnSavePortfolio');
let currentModalStock = null; // Menyimpan kode saham yang sedang dibuka di modal

// --- GLOBAL STATE ---
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 

// Mendapatkan elemen tabel dan status untuk setiap kategori 
// Asumsi: Kita hanya menggunakan satu tabel utama (#mainTable) seperti di file index.html pertama
const categories = {
    maCross: { tableBody: document.querySelector('#mainTable tbody'), statusEl: null, tableEl: document.getElementById('mainTable') }
    // Kategori lain tidak digunakan di sini untuk menyederhanakan kode
};


// ********************************************
// UTILITY FUNCTIONS (DEBOUNCE, FORMATTING)
// ********************************************
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
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

function getSignalClass(signal) {
    if (!signal) return '';
    if (signal.includes('BUY') || signal.includes('OVERSOLD') || signal.includes('GOLDEN')) return 'signal-buy';
    if (signal.includes('SELL') || signal.includes('OVERBOUGHT') || signal.includes('DEAD')) return 'signal-sell';
    if (signal.includes('WATCH') || signal.includes('SPIKE')) return 'signal-watch';
    return '';
}

// ********************************************
// 1. FITUR PENCARIAN (SEARCH BAR)
// ********************************************

if (stockSearchInput && searchResults) {
    stockSearchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.toUpperCase();
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }
    
        // Cari di tabel data_saham (distinct codes)
        const { data } = await supabaseClient
            .from('data_saham')
            .select('"Kode Saham"')
            .ilike('Kode Saham', `%${query}%`)
            .limit(10); 
    
        if (data && data.length > 0) {
            const uniqueStocks = [...new Set(data.map(item => item["Kode Saham"]))];
            
            searchResults.innerHTML = '';
            uniqueStocks.forEach(code => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.textContent = code;
                div.onclick = () => {
                    showStockDetailModal(code);
                    searchResults.style.display = 'none';
                    stockSearchInput.value = '';
                };
                searchResults.appendChild(div);
            });
            searchResults.style.display = 'block';
        } else {
            searchResults.style.display = 'none';
        }
    }, 300));
    
    document.addEventListener('click', (e) => {
        if (!stockSearchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
}


// ********************************************
// 2. FITUR UPLOAD CSV (REVISI KE temp_saham)
// ********************************************

if (btnUploadCsv && csvFileInput) {
    btnUploadCsv.addEventListener('click', () => {
        const file = csvFileInput.files[0];
        if (!file) {
            alert('Pilih file CSV terlebih dahulu!');
            return;
        }
    
        Papa.parse(file, {
            header: true,
            dynamicTyping: false, // Penting: Jangan gunakan dynamic typing, kirim semua sebagai string/text ke temp_saham
            skipEmptyLines: true,
            complete: async function(results) {
                const rows = results.data;
                if (rows.length === 0) return;
    
                statusMessage.textContent = `Mengupload ${rows.length} baris data ke temp_saham...`;
                
                const firstRow = rows[0];
                if (!firstRow.hasOwnProperty('Kode Saham') || !firstRow.hasOwnProperty('Penutupan')) {
                    alert('Format CSV salah! Pastikan header Kode Saham dan Penutupan ada.');
                    return;
                }
    
                const BATCH_SIZE = 100;
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const batch = rows.slice(i, i + BATCH_SIZE);
                    
                    // Siapkan data untuk tabel temp_saham (semua kolom yang mungkin ada di CSV)
                    const cleanBatch = batch.map(row => ({
                        // Mapping kolom ke tipe data text sesuai skema temp_saham
                        "No": row["No"] !== undefined ? String(row["No"]) : null,
                        "Kode Saham": row["Kode Saham"] !== undefined ? String(row["Kode Saham"]).toUpperCase() : null, // UpperCase untuk konsistensi
                        "Nama Perusahaan": row["Nama Perusahaan"] !== undefined ? String(row["Nama Perusahaan"]) : null,
                        "Remarks": row["Remarks"] !== undefined ? String(row["Remarks"]) : null,
                        "Sebelumnya": row["Sebelumnya"] !== undefined ? String(row["Sebelumnya"]) : null,
                        "Open Price": row["Open Price"] !== undefined ? String(row["Open Price"]) : null,
                        "Tanggal Perdagangan Terakhir": (row["Tanggal Perdagangan Terakhir"] || row["Tanggal"]) !== undefined 
                            ? String(row["Tanggal Perdagangan Terakhir"] || row["Tanggal"]) : null, 
                        "First Trade": row["First Trade"] !== undefined ? String(row["First Trade"]) : null,
                        "Tertinggi": row["Tertinggi"] !== undefined ? String(row["Tertinggi"]) : null,
                        "Terendah": row["Terendah"] !== undefined ? String(row["Terendah"]) : null,
                        "Penutupan": row["Penutupan"] !== undefined ? String(row["Penutupan"]) : null,
                        "Selisih": row["Selisih"] !== undefined ? String(row["Selisih"]) : null,
                        "Volume": row["Volume"] !== undefined ? String(row["Volume"]) : null,
                        "Nilai": row["Nilai"] !== undefined ? String(row["Nilai"]) : null,
                        "Frekuensi": row["Frekuensi"] !== undefined ? String(row["Frekuensi"]) : null,
                        "Index Individual": row["Index Individual"] !== undefined ? String(row["Index Individual"]) : null,
                        "Offer": row["Offer"] !== undefined ? String(row["Offer"]) : null,
                        "Offer Volume": row["Offer Volume"] !== undefined ? String(row["Offer Volume"]) : null,
                        "Bid": row["Bid"] !== undefined ? String(row["Bid"]) : null,
                        "Bid Volume": row["Bid Volume"] !== undefined ? String(row["Bid Volume"]) : null,
                        "Listed Shares": row["Listed Shares"] !== undefined ? String(row["Listed Shares"]) : null,
                        "Tradeble Shares": row["Tradeble Shares"] !== undefined ? String(row["Tradeble Shares"]) : null,
                        "Weight For Index": row["Weight For Index"] !== undefined ? String(row["Weight For Index"]) : null,
                        "Foreign Sell": row["Foreign Sell"] !== undefined ? String(row["Foreign Sell"]) : null,
                        "Foreign Buy": row["Foreign Buy"] !== undefined ? String(row["Foreign Buy"]) : null,
                        "Non Regular Volume": row["Non Regular Volume"] !== undefined ? String(row["Non Regular Volume"]) : null,
                        "Non Regular Value": row["Non Regular Value"] !== undefined ? String(row["Non Regular Value"]) : null,
                        "Non Regular Frequency": row["Non Regular Frequency"] !== undefined ? String(row["Non Regular Frequency"]) : null,
                    })).filter(row => row["Kode Saham"] && row["Tanggal Perdagangan Terakhir"]); 
    
                    // *** REVISI UTAMA DI SINI: Target tabel diubah ke temp_saham ***
                    const { error } = await supabaseClient
                        .from('temp_saham') 
                        .insert(cleanBatch); // Menggunakan insert karena tidak ada PK eksplisit di skema temp_saham
    
                    if (error) {
                        console.error('Error upload batch ke temp_saham:', error);
                        alert(`Gagal upload di baris ${i}. Cek console. Pesan Error: ${error.message}`);
                        return;
                    }
                }
    
                alert('Upload ke temp_saham Berhasil! Trigger akan memproses data ini.');
                statusMessage.textContent = `Upload ${rows.length} baris ke temp_saham Selesai.`;
            }
        });
    });
}


// ********************************************
// 3. LOGIKA PORTOFOLIO & UTAMA
// ********************************************

// FUNGSI BARU: Mengambil semua kode saham yang dimiliki (DIPERBARUI untuk tanggal_beli)
async function fetchPortfolio() {
    try {
        const { data, error } = await supabaseClient
            .from('portofolio_saham')
            .select('kode_saham, harga_beli, tanggal_beli'); 
        
        if (error) throw error;
        
        // Simpan data portofolio sebagai Map untuk pencarian cepat (Kode Saham -> { hargaBeli, tanggalBeli })
        globalPortfolio = new Map(data.map(item => [item.kode_saham, { hargaBeli: item.harga_beli, tanggalBeli: item.tanggal_beli }]));
        
        return globalPortfolio;
    } catch (error) {
        console.error('Error fetching portfolio: Pastikan tabel portofolio_saham ada.', error);
        return new Map(); 
    }
}

// ... (fetchCustomMASignals, mergeSignals, fetchAndRenderSignals, populateDateFilter, applySignalFilter, sortSignals, categorizeAndRender, setupSorting, updateSortIcons, setupStockClickHandlers tetap sama) ...
// Saya asumsikan kode ini sudah benar dari file yang Anda unggah

// Fungsi renderCategory (Direvisi agar menggunakan mainTable dan tidak mengulanginya, serta menggunakan data portofolio)
function renderCategory(categoryKey, data) {
    const tableBody = mainTableBody; // Targetkan tbody #mainTable
    
    // Clear previous content only if it's the main rendering pass (maCross for simplicity)
    if (categoryKey === 'maCross') {
        tableBody.innerHTML = '';
    }

    // Hanya render jika data yang diterima adalah untuk mainTable
    if (categoryKey !== 'maCross') {
        // Jika Anda ingin mempertahankan tabel kategori, Anda harus mengimplementasikannya kembali.
        // Untuk saat ini, kita hanya menggunakan mainTable.
        return;
    } 
    
    if (data.length === 0) {
        statusMessage.textContent = `Tidak ada sinyal terdeteksi setelah filter.`;
        return;
    }

    data.forEach(item => {
        const row = tableBody.insertRow();
        
        const stockCode = item["Kode Saham"];
        const isOwned = globalPortfolio.has(stockCode); 
        const portfolioData = globalPortfolio.get(stockCode) || {}; 
        
        // Kolom 1: Kode Saham (Clickable)
        const codeCell = row.insertCell();
        codeCell.textContent = stockCode;
        codeCell.classList.add('clickable-stock'); 

        // Kolom 2: Status Kepemilikan (BARU)
        const statusCell = row.insertCell(); 
        if (isOwned) {
            statusCell.innerHTML = `<span style="background-color: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 4px; font-weight: 600;">OWNED</span>`;
        } else {
            statusCell.innerHTML = `<span style="background-color: #f3f4f6; color: #4b5563; padding: 4px 8px; border-radius: 4px;">WATCHLIST</span>`;
        }
        
        // Kolom 3: Harga Beli (BARU)
        const buyPriceCell = row.insertCell(); 
        
        // Kolom 4: P/L (%) (BARU)
        const profitLossCell = row.insertCell();

        if (isOwned && portfolioData.hargaBeli) {
            const currentPrice = item.Penutupan; // Menggunakan Penutupan
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
        // Kolom 6: Penutupan (Diubah dari Close)
        row.insertCell().textContent = formatNumber(item.Penutupan); 
        // Kolom 7: Volume
        row.insertCell().textContent = formatNumber(item.Volume, true);
        
        // Kolom 8: Perubahan Harian (%)
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
        // Menggabungkan semua sinyal di kolom terakhir untuk mainTable
        const allSignals = [item.Sinyal_MA, item.Sinyal_RSI, item.Sinyal_MACD, item.Sinyal_Volume].filter(s => s);
        const signalText = allSignals.join(', ');
        
        const signalSpan = document.createElement('span'); 
        signalSpan.textContent = signalText;
        signalSpan.className = getSignalClass(signalText); 
        signalCell.appendChild(signalSpan);
    });
}


// ********************************************
// 4. MANAJEMEN PORTOFOLIO (DI DALAM MODAL)
// ********************************************

if (chkOwned && portfolioInputs) {
    // Event Listener Checkbox Owned
    chkOwned.addEventListener('change', (e) => {
        portfolioInputs.style.display = e.target.checked ? 'block' : 'none';
    });
}

if (btnSavePortfolio) {
    // Event Listener Tombol Simpan
    btnSavePortfolio.addEventListener('click', async () => {
        if (!currentModalStock) return;

        if (chkOwned.checked) {
            // Simpan / Update
            const price = inputBuyPrice.value;
            const date = inputBuyDate.value;
            
            if (!price || !date) {
                alert('Mohon isi Tanggal Beli dan Harga Beli.');
                return;
            }

            const { error } = await supabaseClient.from('portofolio_saham').upsert({
                kode_saham: currentModalStock,
                harga_beli: price,
                tanggal_beli: date
            }, { onConflict: 'kode_saham' }); 

            if (!error) {
                alert('Portofolio disimpan!');
                await fetchPortfolio(); // Refresh data lokal
                fetchAndRenderSignals(dateFilter.value); // Refresh tabel utama
            } else {
                alert('Gagal menyimpan: ' + error.message);
            }
        } else {
            // Hapus dari Portofolio
            if (confirm('Hapus saham ini dari portofolio?')) {
                const { error } = await supabaseClient
                    .from('portofolio_saham')
                    .delete()
                    .eq('kode_saham', currentModalStock);
                    
                if (!error) {
                    alert('Dihapus dari portofolio.');
                    if (inputBuyPrice) inputBuyPrice.value = '';
                    if (inputBuyDate) inputBuyDate.value = '';
                    
                    await fetchPortfolio();
                    fetchAndRenderSignals(dateFilter.value);
                } else {
                    alert('Gagal menghapus: ' + error.message);
                }
            } else {
                if (chkOwned) chkOwned.checked = true; 
                if (portfolioInputs) portfolioInputs.style.display = 'block';
            }
        }
    });
}


// ********************************************
// FUNGSI UTAMA DETAIL SAHAM (Update untuk Portofolio)
// ********************************************

async function showStockDetailModal(stockCode) {
    currentModalStock = stockCode; // Set variabel global
    modalTitle.textContent = `Detail Saham ${stockCode}`;
    stockDetailModal.style.display = 'flex';
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Memuat data...</td></tr>';
    
    if (priceChart) {
        priceChart.destroy();
    }
    
    // --- PORTOFOLIO LOGIC INTEGRATION START ---
    const portfolioData = globalPortfolio.get(stockCode);
    if (portfolioData && chkOwned && portfolioInputs) {
        chkOwned.checked = true;
        portfolioInputs.style.display = 'block';
        if (inputBuyPrice) inputBuyPrice.value = portfolioData.hargaBeli;
        if (inputBuyDate) inputBuyDate.value = portfolioData.tanggalBeli; 
    } else if (chkOwned && portfolioInputs) {
        chkOwned.checked = false;
        portfolioInputs.style.display = 'none';
        if (inputBuyPrice) inputBuyPrice.value = '';
        if (inputBuyDate) inputBuyDate.value = '';
    }
    // --- PORTOFOLIO LOGIC INTEGRATION END ---

    try {
        // Kueri 1: Ambil data indikator dari indikator_teknikal
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
        
        // Kueri 2: Ambil harga penutupan dari data_saham
        const dates = indicatorData.map(item => item.Tanggal);
        const { data: priceData, error: priceError } = await supabaseClient
            .from('data_saham')
            .select(`"Tanggal Perdagangan Terakhir", "Penutupan"`)
            .eq('Kode Saham', stockCode)
            .in('Tanggal Perdagangan Terakhir', dates);
            
        if (priceError) throw priceError;

        if (indicatorData.length === 0 || priceData.length === 0) {
            rawIndicatorTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Tidak ada data historis ditemukan.</td></tr>';
            return;
        }

        // Gabungkan data berdasarkan Tanggal
        const priceMap = new Map(priceData.map(item => [item["Tanggal Perdagangan Terakhir"], item.Penutupan]));
        
        const historicalData = indicatorData.map(ind => ({
            Tanggal: ind.Tanggal,
            Penutupan: priceMap.get(ind.Tanggal) || null,
            RSI: ind.RSI,
            MACD_Line: ind.MACD_Line,
            Signal_Line: ind.Signal_Line,
            MA_Cepat: ind.MA_5, 
            MA_Lambat: ind.MA_20 
        })).reverse(); 

        renderRawIndicatorTable(historicalData);
        renderPriceIndicatorChart(stockCode, historicalData);

    } catch (err) {
        console.error("Error memuat detail saham:", err);
        rawIndicatorTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Error: ${err.message}. Cek apakah kolom MA_5/MA_20/RSI/MACD_Line/Signal_Line ada di tabel indikator_teknikal.</td></tr>`;
    }
}

// ... (renderRawIndicatorTable, renderPriceIndicatorChart, setupModalHandlers, setupStockClickHandlers, handleStockClick tetap sama) ...
// Saya asumsikan kode ini sudah benar dari file yang Anda unggah
