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

// Fungsi format angka (baru, diperlukan untuk data fundamental)
function formatNumber(num, isVolume = false) {
    if (num === null || num === undefined) return '-';
    
    const number = parseFloat(num);
    
    if (isVolume) {
        // Volume format (contoh: 1.2 Jt, 100 Rb)
        if (number >= 1000000) return (number / 1000000).toFixed(2) + ' Jt';
        if (number >= 1000) return (number / 1000).toFixed(1) + ' Rb';
        return number.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    }
    // Harga format (IDR)
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number);
}

// Fungsi untuk mengkategorikan data berdasarkan sinyal non-NULL
function categorizeSignals(signals) {
    const categorized = { maCross: [], rsi: [], macd: [], volume: [] };

    signals.forEach(item => {
        // Pastikan ada data fundamental sebelum dikategorikan
        if (!item.Close) { 
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

// Fungsi untuk me-render data ke dalam kategori tabel (DIMODIFIKASI untuk kolom baru)
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
        
        row.insertCell().textContent = item["Kode Saham"];
        row.insertCell().textContent = item["Tanggal"];
        
        // --- DATA FUNDAMENTAL BARU ---
        row.insertCell().textContent = formatNumber(item.Close); // Harga Penutupan
        row.insertCell().textContent = formatNumber(item.Volume, true); // Volume Harian
        
        // Persentase Perubahan (Selisih)
        const percentChange = item.Selisih ? parseFloat(item.Selisih) : 0;
        const changeCell = row.insertCell();
        changeCell.textContent = `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`;
        
        if (percentChange > 0) {
            changeCell.style.color = '#155724'; // Hijau (Gaya Buy)
        } else if (percentChange < 0) {
            changeCell.style.color = '#721c24'; // Merah (Gaya Sell)
        }
        // --- AKHIR DATA FUNDAMENTAL ---


        // Kolom Sinyal (Aksi)
        const signalCell = row.insertCell();
        const signalText = item[signalKey];
        signalCell.textContent = signalText;
        signalCell.className = getSignalClass(signalText);
    });
}

// Fungsi utama untuk mengambil dan menampilkan data (DIMODIFIKASI)
async function fetchAndRenderSignals() {
    statusMessage.textContent = 'Langkah 1/3: Mengambil data sinyal...';
    
    try {
        // Query 1: Ambil data sinyal dan tentukan tanggal terbaru
        const { data: signalData, error: signalError } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`"Kode Saham", "Tanggal", "Sinyal_MA", "Sinyal_RSI", "Sinyal_MACD", "Sinyal_Volume"`)
            .order('Tanggal', { ascending: false })
            .limit(100); 

        if (signalError) throw signalError;
        
        if (signalData.length === 0) {
            statusMessage.textContent = 'Tidak ada data sinyal ditemukan.';
            return;
        }

        // Tentukan Tanggal Terbaru
        const latestDate = signalData[0].Tanggal;
        
        statusMessage.textContent = `Langkah 2/3: Mengambil data fundamental untuk ${latestDate}...`;

        // Query 2: Ambil data fundamental hanya untuk tanggal terbaru
        // Gunakan nama kolom Supabase: "Penutupan", "Volume", "Selisih", "Tanggal Perdagangan Terakhir"
        const { data: fundamentalData, error: fundamentalError } = await supabaseClient
            .from('data_saham')
            .select(`"Kode Saham", "Penutupan", "Volume", "Selisih"`)
            .eq('Tanggal Perdagangan Terakhir', latestDate);

        if (fundamentalError) throw fundamentalError;

        // Map data fundamental ke dalam objek untuk pencarian cepat
        const fundamentalMap = {};
        fundamentalData.forEach(item => {
            const key = item["Kode Saham"];
            // Gunakan nama kunci yang lebih singkat untuk JS: Close, Volume, Selisih
            fundamentalMap[key] = {
                Close: item.Penutupan, 
                Volume: item.Volume,
                Selisih: item.Selisih 
            };
        });

        statusMessage.textContent = 'Langkah 3/3: Menggabungkan dan merender data...';
        
        // Gabungkan Sinyal Harian dan Data Fundamental
        const combinedSignals = [];
        
        const dailySignals = signalData.filter(s => s.Tanggal === latestDate);

        dailySignals.forEach(s => {
            const fundamental = fundamentalMap[s["Kode Saham"]];
            
            // Gabungkan jika sinyal dan fundamental ada, DAN memiliki minimal satu sinyal
            if (fundamental && (s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume)) {
                combinedSignals.push({
                    ...s,
                    ...fundamental // Menambahkan Close, Volume, Selisih
                });
            }
        });

        if (combinedSignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal terdeteksi pada tanggal ${latestDate} dengan data fundamental lengkap.`;
            // Sembunyikan semua tabel jika tidak ada sinyal
            Object.values(categories).forEach(({ tableEl }) => tableEl.style.display = 'none');
            Object.values(categories).forEach(({ statusEl }) => statusEl.style.display = 'block');
            return;
        }
        
        // Kategorikan dan Render Data
        const categorizedData = categorizeSignals(combinedSignals);
        
        renderCategory('maCross', categorizedData.maCross);
        renderCategory('rsi', categorizedData.rsi);
        renderCategory('volume', categorizedData.volume);
        renderCategory('macd', categorizedData.macd);

        let totalSignals = Object.values(categorizedData).flat().length;
        statusMessage.textContent = `Sinyal untuk ${combinedSignals.length} saham terdeteksi pada ${latestDate}. Total ${totalSignals} Sinyal.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}. Cek koneksi Supabase.`;
        console.error('Error fetching data:', error);
    }
}

// Jalankan fungsi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
