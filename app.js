// KREDENSIAL SUPABASE ANDA
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

const statusMessage = document.getElementById('statusMessage');

const categories = {
    maCross: { tableBody: document.querySelector('#maCrossTable tbody'), statusEl: document.getElementById('maStatus'), tableEl: document.getElementById('maCrossTable') },
    rsi: { tableBody: document.querySelector('#rsiTable tbody'), statusEl: document.getElementById('rsiStatus'), tableEl: document.getElementById('rsiTable') },
    macd: { tableBody: document.querySelector('#macdTable tbody'), statusEl: document.getElementById('macdStatus'), tableEl: document.getElementById('macdTable') },
    volume: { tableBody: document.querySelector('#volumeTable tbody'), statusEl: document.getElementById('volumeStatus'), tableEl: document.getElementById('volumeTable') }
};

function getSignalClass(signal) {
    if (!signal) return '';
    if (signal.includes('BUY') || signal.includes('OVERSOLD')) return 'signal-buy';
    if (signal.includes('SELL') || signal.includes('OVERBOUGHT')) return 'signal-sell';
    if (signal.includes('WATCH') || signal.includes('SPIKE')) return 'signal-watch';
    return '';
}

function categorizeSignals(signals) {
    const categorized = { maCross: [], rsi: [], macd: [], volume: [] };

    signals.forEach(item => {
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
        
        // Ambil data harga dan volume dari hasil join (data_saham adalah array)
        const priceData = item.data_saham ? item.data_saham[0] : null; 
        
        row.insertCell().textContent = item["Kode Saham"];
        row.insertCell().textContent = item["Tanggal"];

        // KOLOM HARGA PENUTUPAN
        const closePrice = priceData ? parseFloat(priceData["Penutupan"]).toLocaleString('id-ID', { minimumFractionDigits: 0 }) : 'N/A';
        row.insertCell().textContent = closePrice;
        
        // KOLOM VOLUME (Dalam Juta)
        const volumeVal = priceData ? parseFloat(priceData["Volume"]) / 1000000 : 0;
        row.insertCell().textContent = volumeVal.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' Jt';

        // Kolom Sinyal (Aksi)
        const signalCell = row.insertCell();
        const signalText = item[signalKey];
        signalCell.textContent = signalText;
        signalCell.className = getSignalClass(signalText);
    });
}

// FUNGSI UTAMA DENGAN QUERY JOIN YANG SUDAH DIPERBAIKI (TANPA KOMENTAR YANG ERROR)
async function fetchAndRenderSignals() {
    statusMessage.textContent = 'Mengambil data sinyal dan harga...';
    
    try {
        const { data: signals, error } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`
                "Kode Saham",
                "Tanggal",
                "Sinyal_MA",
                "Sinyal_RSI",
                "Sinyal_MACD",
                "Sinyal_Volume",
                
                -- QUERY JOIN YANG DIPERBAIKI (tanpa komentar)
                data_saham (Penutupan, Volume)
            `)
            .order('Tanggal', { ascending: false })
            .limit(100); 

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
        );

        if (dailySignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal terdeteksi pada tanggal ${latestDate}.`;
            Object.values(categories).forEach(({ tableEl }) => tableEl.style.display = 'none');
            Object.values(categories).forEach(({ statusEl }) => statusEl.style.display = 'block');
            return;
        }
        
        // 3. Kategorikan Data
        const categorizedData = categorizeSignals(dailySignals);
        
        // 4. Render per Kategori
        renderCategory('maCross', categorizedData.maCross);
        renderCategory('rsi', categorizedData.rsi);
        renderCategory('macd', categorizedData.macd);
        renderCategory('volume', categorizedData.volume);

        let totalSignals = Object.values(categorizedData).flat().length;
        statusMessage.textContent = `Sinyal untuk ${dailySignals.length} saham terdeteksi pada ${latestDate}. Total ${totalSignals} Sinyal.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}`;
        console.error('Error fetching data:', error);
    }
}

document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
