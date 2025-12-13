// GANTI DENGAN KREDENSIAL SUPABASE ANDA
// Kredensial di bawah ini diambil dari file app (6).js yang Anda unggah
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; //
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; //

// --- PERBAIKAN INISIALISASI ---
// Mengambil fungsi createClient dari objek global (window.supabase)
const { createClient } = window.supabase; 
// Menginisialisasi klien dengan nama yang unik dan aman
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 
// ------------------------------

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
    statusMessage.textContent = 'Mengambil data dari server...';
    
    // Format tanggal hari ini (misalnya 2025-12-13)
    const today = new Date().toISOString().slice(0, 10);

    try {
        // --- PERUBAHAN: Menggunakan supabaseClient ---
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
            // Ambil hanya data yang paling baru diproses
            .order('Tanggal', { ascending: false })
            .limit(50); 
        // ---------------------------------------------

        if (error) throw error;

        // Asumsi data sudah diurutkan (paling baru di atas)
        const latestDate = signals.length > 0 ? signals[0].Tanggal : null;

        const dailySignals = signals.filter(s => 
            s.Tanggal === latestDate && (s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume)
        );

        if (dailySignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal yang terdeteksi pada tanggal ${latestDate || today}. (Pastikan sudah ada data 26 hari)`;
            return;
        }

        signalTableBody.innerHTML = ''; // Kosongkan tabel
        
        // Loop melalui data dan buat baris tabel
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
            macdCell.textContent = item["Sinyal_MACD"] || '—';
            macdCell.className = getSignalClass(item["Sinyal_MACD"]);
            
            // Kolom Sinyal Volume
            const volumeCell = row.insertCell();
            volumeCell.textContent = item["Sinyal_Volume"] || '—';
            volumeCell.className = getSignalClass(item["Sinyal_Volume"]);
        });

        statusMessage.textContent = `Sinyal terdeteksi untuk ${dailySignals.length} saham pada ${latestDate}.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}`;
        console.error('Error fetching data:', error);
    }
}

// Jalankan fungsi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
                "Sinyal_RSI",
                "Sinyal_MACD",
                "Sinyal_Volume"
            `)
            // Ambil hanya data yang paling baru diproses
            .order('Tanggal', { ascending: false })
            .limit(50); // Batasi jumlah saham yang ditampilkan

        if (error) throw error;

        // Filter data untuk hanya mengambil yang memiliki minimal satu sinyal hari ini
        // Kita ambil semua data dan biarkan logika filtering di frontend,
        // atau kita ambil tanggal paling baru dari hasil sorting.
        
        // Asumsi data sudah diurutkan (paling baru di atas)
        const latestDate = signals.length > 0 ? signals[0].Tanggal : null;

        const dailySignals = signals.filter(s => 
            s.Tanggal === latestDate && (s.Sinyal_MA || s.Sinyal_RSI || s.Sinyal_MACD || s.Sinyal_Volume)
        );

        if (dailySignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal yang terdeteksi pada tanggal ${latestDate || today}.`;
            return;
        }

        signalTableBody.innerHTML = ''; // Kosongkan tabel
        
        // Loop melalui data dan buat baris tabel
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
            macdCell.textContent = item["Sinyal_MACD"] || '—';
            macdCell.className = getSignalClass(item["Sinyal_MACD"]);
            
            // Kolom Sinyal Volume
            const volumeCell = row.insertCell();
            volumeCell.textContent = item["Sinyal_Volume"] || '—';
            volumeCell.className = getSignalClass(item["Sinyal_Volume"]);
        });

        statusMessage.textContent = `Sinyal terdeteksi untuk ${dailySignals.length} saham pada ${latestDate}.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}`;
        console.error('Error fetching data:', error);
    }
}

// Jalankan fungsi ketika halaman dimuat
document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
