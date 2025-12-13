// GANTI DENGAN KREDENSIAL SUPABASE ANDA
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

const statusMessage = document.getElementById('statusMessage');
const dateFilter = document.getElementById('dateFilter'); 
const signalFilter = document.getElementById('signalFilter'); // Elemen filter sinyal baru

// Variabel Global untuk menyimpan data yang sudah digabungkan dan status sorting
let globalCombinedSignals = [];
let sortState = { column: 'Kode Saham', direction: 'asc' }; // Status sorting default

// Mendapatkan elemen tabel dan status untuk setiap kategori
const categories = {
    maCross: { tableBody: document.querySelector('#maCrossTable tbody'), statusEl: document.getElementById('maStatus'), tableEl: document.getElementById('maCrossTable') },
    rsi: { tableBody: document.querySelector('#rsiTable tbody'), statusEl: document.getElementById('rsiStatus'), tableEl: document.getElementById('rsiTable') },
    macd: { tableBody: document.querySelector('#macdTable tbody'), statusEl: document.getElementById('macdStatus'), tableEl: document.getElementById('macdTable') },
    volume: { tableBody: document.querySelector('#volumeTable tbody'), statusEl: document.getElementById('volumeStatus'), tableEl: document.getElementById('volumeTable') }
};

// Fungsi pembantu untuk menentukan kelas warna sinyal
function getSignalClass(signal) {
    if (!signal) return '';
    if (signal.includes('BUY') || signal.includes('OVERSOLD') || signal.includes('GOLDEN')) return 'signal-buy';
    if (signal.includes('SELL') || signal.includes('OVERBOUGHT') || signal.includes('DEAD')) return 'signal-sell';
    if (signal.includes('WATCH') || signal.includes('SPIKE')) return 'signal-watch';
    return '';
}

// Fungsi format angka (untuk Volume dan Harga)
function formatNumber(num, isVolume = false) {
    if (num === null || num === undefined) return '-';
    
    const number = parseFloat(num);
    
    if (isVolume) {
        if (number >= 1000000000) return (number / 1000000000).toFixed(2) + ' M';
        if (number >= 1000000) return (number / 1000000).toFixed(2) + ' Jt';
        if (number >= 1000) return (number / 1000).toFixed(1) + ' Rb';
        return number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    }
    // Format harga sebagai IDR tanpa desimal
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number);
}

// FUNGSI BARU: Logika Penyaringan Sinyal (Signal Filtering)
function applySignalFilter(signals, filterType) {
    if (filterType === 'ALL') {
        return signals;
    }
    
    const filtered = signals.filter(item => {
        // Cek semua sinyal yang ada di item
        const allSignals = [item.Sinyal_MA, item.Sinyal_RSI, item.Sinyal_MACD, item.Sinyal_Volume].filter(s => s);
        
        // Gabungkan semua sinyal dalam satu string (case-insensitive)
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

// FUNGSI BARU: Logika Penyortiran Kolom (Column Sorting)
function sortSignals(signals, column, direction) {
    const isNumeric = ['Close', 'Volume', 'Selis'].includes(column);

    return signals.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

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

// Fungsi untuk mengkategorikan data (sedikit dimodifikasi untuk menggunakan data yang sudah difilter/disortir)
function categorizeAndRender(signals) {
    // 1. Terapkan Sorting
    const sortedSignals = sortSignals([...signals], sortState.column, sortState.direction);

    const categorized = { maCross: [], rsi: [], macd: [], volume: [] };

    // 2. Kategorisasi Data
    sortedSignals.forEach(item => {
        if (!item.Close) return; 

        // Gunakan sortedSignals untuk kategorisasi, tetapi filter tetap dipertahankan
        // Catatan: Jika ingin Filter Sinyal per kategori (misalnya hanya BUY di MA Cross), perlu logika yang lebih spesifik di sini.
        // Saat ini, filter sinyal diterapkan pada data sebelum kategorisasi.

        if (item.Sinyal_MA) categorized.maCross.push(item);
        if (item.Sinyal_RSI) categorized.rsi.push(item);
        if (item.Sinyal_MACD) categorized.macd.push(item);
        if (item.Sinyal_Volume) categorized.volume.push(item);
    });
    
    // 3. Render per Kategori
    renderCategory('maCross', categorized.maCross);
    renderCategory('rsi', categorized.rsi);
    renderCategory('volume', categorized.volume);
    renderCategory('macd', categorized.macd);
    
    let totalSignals = Object.values(categorized).flat().length;
    let totalStocks = signals.length;
    const date = signals.length > 0 ? signals[0].Tanggal : dateFilter.value;
    statusMessage.textContent = `Sinyal untuk ${totalStocks} saham terdeteksi pada ${date} (Setelah Filter). Total ${totalSignals} Sinyal.`;
    
    // Perbarui ikon sorting
    updateSortIcons();
}

// FUNGSI BARU: Untuk menginisialisasi event sorting
function setupSorting() {
    document.querySelectorAll('.signal-category th[data-column]').forEach(header => {
        header.addEventListener('click', function() {
            const column = this.getAttribute('data-column');
            let direction = 'asc';

            if (sortState.column === column) {
                // Balik arah jika kolom yang sama diklik
                direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            }

            // Update state
            sortState.column = column;
            sortState.direction = direction;

            // Render ulang data yang sudah ada (globalCombinedSignals)
            const filterValue = signalFilter.value;
            const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);
            categorizeAndRender(filteredSignals);
        });
    });
}

// FUNGSI BARU: Untuk memperbarui ikon panah sorting
function updateSortIcons() {
    document.querySelectorAll('.signal-category th[data-column]').forEach(header => {
        const column = header.getAttribute('data-column');
        const icon = header.querySelector('.sort-icon');
        icon.textContent = '↕';
        icon.classList.remove('active');

        if (column === sortState.column) {
            icon.textContent = sortState.direction === 'asc' ? '↑' : '↓';
            icon.classList.add('active');
        }
    });
}


// Fungsi untuk me-render data ke dalam kategori tabel (Hanya UI rendering)
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
        
        // Urutan kolom harus sesuai dengan header: Kode Saham, Tanggal, Close, Volume, Selisih, Sinyal
        row.insertCell().textContent = item["Kode Saham"];
        row.insertCell().textContent = item["Tanggal"];
        row.insertCell().textContent = formatNumber(item.Close); 
        row.insertCell().textContent = formatNumber(item.Volume, true);
        
        const percentChange = item.Selisih ? parseFloat(item.Selisih) : 0;
        const changeCell = row.insertCell();
        changeCell.textContent = `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`;
        
        if (percentChange > 0) {
            changeCell.style.color = 'var(--buy-color)'; 
        } else if (percentChange < 0) {
            changeCell.style.color = 'var(--sell-color)'; 
        } else {
            changeCell.style.color = 'var(--text-color)'; 
        }
        changeCell.style.fontWeight = 'bold';

        const signalCell = row.insertCell();
        const signalText = item[signalKey];
        const signalSpan = document.createElement('span'); 
        signalSpan.textContent = signalText;
        signalSpan.className = getSignalClass(signalText); 
        signalCell.appendChild(signalSpan);
    });
}


// FUNGSI UTAMA DIMODIFIKASI: Menerima selectedDate sebagai argumen
async function fetchAndRenderSignals(selectedDate = null) {
    statusMessage.textContent = 'Memuat data...';
    
    try {
        // ... (Logika Query 1 & 2 dari Supabase tetap sama) ...
        // Logika Query 1: Ambil data sinyal untuk menentukan tanggal
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
        if (signalData.length === 0) {
            statusMessage.textContent = 'Tidak ada data sinyal ditemukan.';
            return;
        }

        const dateToFilter = selectedDate || signalData[0].Tanggal;

        // Jika ini adalah pemuatan pertama, isi filter tanggal
        if (!selectedDate) {
            await populateDateFilter(dateToFilter);
            dateFilter.value = dateToFilter;
        }
        
        // Logika Query 2: Ambil data fundamental
        const { data: fundamentalData, error: fundamentalError } = await supabaseClient
            .from('data_saham')
            .select(`"Kode Saham", "Penutupan", "Volume", "Selisih"`)
            .eq('Tanggal Perdagangan Terakhir', dateToFilter);

        if (fundamentalError) throw fundamentalError;

        const fundamentalMap = {};
        fundamentalData.forEach(item => {
            const key = item["Kode Saham"];
            fundamentalMap[key] = {
                Close: item.Penutupan,
                Volume: item.Volume,
                Selisih: item.Selisih
            };
        });
        
        // 3. Gabungkan Data (Semua saham pada tanggal itu, yang memiliki sinyal)
        const allSignalsForDate = signalData.filter(s => s.Tanggal === dateToFilter);
        const combinedSignals = [];
        
        allSignalsForDate.forEach(s => {
            const fundamental = fundamentalMap[s["Kode Saham"]];
            if (fundamental && (s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume)) {
                combinedSignals.push({
                    ...s,
                    ...fundamental 
                });
            }
        });

        if (combinedSignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal terdeteksi pada tanggal ${dateToFilter} dengan data fundamental lengkap.`;
            // ... (Kode untuk menyembunyikan tabel dan menampilkan status) ...
            Object.values(categories).forEach(({ tableEl }) => tableEl.style.display = 'none');
            Object.values(categories).forEach(({ statusEl }) => statusEl.style.display = 'block');
            return;
        }
        
        // Simpan data gabungan secara global untuk digunakan oleh filter dan sort
        globalCombinedSignals = combinedSignals;
        
        // Terapkan Filter Sinyal default ('ALL') dan Render
        const filterValue = signalFilter.value;
        const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);

        // Reset status sorting ke default sebelum render pertama
        sortState = { column: 'Kode Saham', direction: 'asc' };

        categorizeAndRender(filteredSignals);

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}. Cek koneksi Supabase.`;
        console.error('Error fetching data:', error);
    }
}

// FUNGSI INI TETAP SAMA DARI SEBELUMNYA
async function populateDateFilter(latestDate) {
    // ... (Logika pengisian dateFilter tetap sama) ...
    // Ambil semua tanggal unik dari tabel indikator_teknikal
    const { data, error } = await supabaseClient
        .from('indikator_teknikal')
        .select('Tanggal')
        .order('Tanggal', { ascending: false });

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
}


// Jalankan fungsi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Event Listeners
    dateFilter.addEventListener('change', () => {
        const selectedDate = dateFilter.value;
        fetchAndRenderSignals(selectedDate);
    });
    
    signalFilter.addEventListener('change', () => {
        // Terapkan filter sinyal pada data yang sudah dimuat
        const filterValue = signalFilter.value;
        const filteredSignals = applySignalFilter(globalCombinedSignals, filterValue);
        categorizeAndRender(filteredSignals); // Render ulang
    });
    
    setupSorting(); // Inisialisasi sorting
    
    // 2. Load Data Awal
    fetchAndRenderSignals(); 
});
