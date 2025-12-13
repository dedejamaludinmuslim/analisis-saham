// GANTI DENGAN KREDENSIAL SUPABASE ANDA
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

const signalTableBody = document.querySelector('#signalTable tbody');
const statusMessage = document.getElementById('statusMessage');

// Fungsi pembantu untuk menentukan kelas warna sinyal
function getSignalClass(signal) {
    if (!signal) return '';
    if (signal.includes('BUY')) return 'signal-buy';
    if (signal.includes('SELL')) return 'signal-sell';
    if (signal.includes('WATCH')) return 'signal-watch';
    return '';
}

// Fungsi utama untuk mengambil dan menampilkan data
async function fetchAndRenderSignals() {
    statusMessage.textContent = 'Mengambil data dari server... (Mode Verifikasi)';
    
    try {
        const { data: signals, error } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`
                "Kode Saham",
                "Tanggal",
                "Sinyal_MA",
                "Sinyal_RSI",
                "Sinyal_MACD",
                "Sinyal_Volume"
            `)
            // Ambil 50 baris data terbaru, terlepas dari sinyalnya
            .order('Tanggal', { ascending: false })
            .limit(50); 

        if (error) throw error;
        
        // --- PERUBAHAN KRITIS: KITA HAPUS SEMUA FILTER DI SINI ---
        // Kita gunakan langsung data yang sudah disortir (50 baris terbaru)
        const dailySignals = signals;

        if (dailySignals.length === 0) {
            statusMessage.textContent = `Tidak ada data ditemukan di tabel indikator_teknikal.`;
            return;
        }

        signalTableBody.innerHTML = ''; // Kosongkan tabel
        
        dailySignals.forEach(item => {
            const row = signalTableBody.insertRow();
            
            row.insertCell().textContent = item["Kode Saham"];
            row.insertCell().textContent = item["Tanggal"];

            // Kolom Sinyal MA
            const maCell = row.insertCell();
            maCell.textContent = item["Sinyal_MA"] || '—';
            maCell.className = getSignalClass(item["Sinyal_MA"]);

            // Kolom Sinyal RSI
            const rsiCell = row.insertCell();
            rsiCell.textContent = item["Sinyal_RSI"] || '—';
            rsiCell.className = getSignalClass(item["Sinyal_RSI"]);
            
            // Kolom Sinyal MACD
            const macdCell = row.insertCell();
            macdCell.textContent = item["Sinyal_MACD"] || '—'; // Akan menampilkan '—' jika NULL
            macdCell.className = getSignalClass(item["Sinyal_MACD"]);
            
            // Kolom Sinyal Volume
            const volumeCell = row.insertCell();
            volumeCell.textContent = item["Sinyal_Volume"] || '—';
            volumeCell.className = getSignalClass(item["Sinyal_Volume"]);
        });
        
        // Status message disesuaikan untuk mode verifikasi
        statusMessage.textContent = `Menampilkan ${dailySignals.length} baris data terbaru (termasuk sinyal NULL) untuk verifikasi.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}`;
        console.error('Error fetching data:', error);
    }
}

// Jalankan fungsi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
