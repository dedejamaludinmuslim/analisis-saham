// GANTI DENGAN KREDENSIAL SUPABASE ANDA
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

const statusMessage = document.getElementById('statusMessage');

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
    if (signal.includes('BUY') || signal.includes('OVERSOLD')) return 'signal-buy';
    if (signal.includes('SELL') || signal.includes('OVERBOUGHT')) return 'signal-sell';
    if (signal.includes('WATCH') || signal.includes('SPIKE')) return 'signal-watch';
    return '';
}

// Fungsi untuk mengkategorikan data berdasarkan sinyal non-NULL
function categorizeSignals(signals) {
    const categorized = { maCross: [], rsi: [], macd: [], volume: [] };

    signals.forEach(item => {
        // Pastikan item memiliki data fundamental sebelum dimasukkan
        if (!item.data_saham_rel || item.data_saham_rel.length === 0) {
            // Lewati jika data fundamental tidak ada
            return; 
        }

        if (item.Sinyal_MA) {
            categorized.maCross.push(item);
        }
        if (item.Sinyal_RSI) {
            categorized.rsi.push(item);
        }
        if (item.Sinyal_MACD) {
            categorized.macd.push(item);
        }
        if (item.Sinyal_Volume) {
            categorized.volume.push(item);
        }
    });
    return categorized;
}

// Fungsi format angka (untuk Volume dan Harga)
function formatNumber(num, isVolume = false) {
    if (num === null || num === undefined) return '-';
    // Format volume dengan K/M jika besar, atau sebagai angka biasa
    if (isVolume) {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + ' Jt';
        if (num >= 1000) return (num / 1000).toFixed(1) + ' Rb';
        return num.toLocaleString('id-ID');
    }
    // Format harga dengan 2 desimal
    return parseFloat(num).toFixed(2).toLocaleString('id-ID');
}

// Fungsi untuk me-render data ke dalam kategori tabel
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
    tableEl.style.display = 'table'; // Tampilkan tabel

    data.forEach(item => {
        // Asumsi data fundamental ada di item.data_saham_rel[0]
        const fundamentalData = item.data_saham_rel ? item.data_saham_rel[0] : {};

        const row = tableBody.insertRow();
        
        row.insertCell().textContent = item["Kode Saham"];
        row.insertCell().textContent = item["Tanggal"];
        
        // --- DATA FUNDAMENTAL BARU ---
        row.insertCell().textContent = formatNumber(fundamentalData.Penutupan); 
        row.insertCell().textContent = formatNumber(fundamentalData.Volume, true);
        
        // Hitung dan format Persentase Perubahan (Selisih)
        const percentChange = fundamentalData.Selisih ? parseFloat(fundamentalData.Selisih) : 0;
        const changeCell = row.insertCell();
        changeCell.textContent = `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`;
        changeCell.style.color = percentChange > 0 ? 'var(--buy-color)' : (percentChange < 0 ? 'var(--sell-color)' : 'var(--text-color)');
        // --- AKHIR DATA FUNDAMENTAL BARU ---

        // Kolom Sinyal (Aksi)
        const signalCell = row.insertCell();
        const signalText = item[signalKey];
        const signalSpan = document.createElement('span'); 
        signalSpan.textContent = signalText;
        signalSpan.className = getSignalClass(signalText); 
        signalCell.appendChild(signalSpan);
    });
}

// Fungsi utama untuk mengambil dan menampilkan data
async function fetchAndRenderSignals() {
    statusMessage.textContent = 'Mengambil data sinyal dan fundamental dari Supabase...';
    
    try {
        // *** PERUBAHAN QUERY UTAMA: Menambahkan Relasi data_saham_rel ***
        const { data: signals, error } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`
                "Kode Saham",
                "Tanggal",
                "Sinyal_MA",
                "Sinyal_RSI",
                "Sinyal_MACD",
                "Sinyal_Volume",
                data_saham_rel:data_saham ( "Penutupan", "Volume", "Selisih" ) 
            `)
            .order('Tanggal', { ascending: false })
            .limit(100); 
            // *** CATATAN: Pastikan 'data_saham_rel' adalah nama relasi Anda di Supabase! ***

        if (error) throw error;
        
        if (signals.length === 0) {
            statusMessage.textContent = 'Tidak ada data ditemukan di tabel indikator_teknikal.';
            return;
        }

        // 1. Tentukan Tanggal Terbaru
        const latestDate = signals[0].Tanggal;
        
        // 2. Filter data untuk Tanggal Terbaru DAN memiliki MINIMAL satu sinyal
        const dailySignals = signals.filter(s => 
            s.Tanggal === latestDate && (s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume)
            && s.data_saham_rel && s.data_saham_rel.length > 0 // Hanya data yang memiliki data fundamental terkait
        );

        if (dailySignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal terdeteksi pada tanggal ${latestDate} dengan data fundamental lengkap.`;
            
            Object.values(categories).forEach(({ tableEl }) => tableEl.style.display = 'none');
            Object.values(categories).forEach(({ statusEl }) => statusEl.style.display = 'block');
            return;
        }
        
        // 3. Kategorikan Data
        const categorizedData = categorizeSignals(dailySignals);
        
        // 4. Render per Kategori
        renderCategory('maCross', categorizedData.maCross);
        renderCategory('rsi', categorizedData.rsi);
        renderCategory('volume', categorizedData.volume);
        renderCategory('macd', categorizedData.macd);

        let totalSignals = Object.values(categorizedData).flat().length;
        statusMessage.textContent = `Sinyal untuk ${dailySignals.length} saham terdeteksi pada ${latestDate}. Total ${totalSignals} Sinyal.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}. Cek apakah relasi 'data_saham' sudah benar.`;
        console.error('Error fetching data:', error);
    }
}

// Jalankan fungsi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
