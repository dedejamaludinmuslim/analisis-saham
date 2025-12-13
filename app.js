// KREDENSIAL SUPABASE ANDA
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

function getSignalClass(signal) {
    if (!signal) return '';
    if (signal.includes('BUY') || signal.includes('OVERSOLD') || signal.includes('GOLDEN CROSS')) return 'signal-buy';
    if (signal.includes('SELL') || signal.includes('OVERBOUGHT') || signal.includes('DEATH CROSS')) return 'signal-sell';
    if (signal.includes('WATCH') || signal.includes('SPIKE')) return 'signal-watch';
    return '';
}

// Fungsi untuk mengkategorikan data berdasarkan sinyal non-NULL
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
        
        row.insertCell().textContent = item["Kode Saham"];
        row.insertCell().textContent = item["Tanggal"];

        // KOLOM HARGA PENUTUPAN (Menggunakan data_saham yang di-merge)
        const closePrice = item.Penutupan ? parseFloat(item.Penutupan).toLocaleString('id-ID', { minimumFractionDigits: 0 }) : 'N/A';
        row.insertCell().textContent = closePrice;
        
        // KOLOM VOLUME (Dalam Juta)
        const volumeVal = item.Volume ? parseFloat(item.Volume) / 1000000 : 0;
        row.insertCell().textContent = volumeVal.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' Jt';

        // Kolom Sinyal (Aksi)
        const signalCell = row.insertCell();
        const signalText = item[signalKey];
        signalCell.textContent = signalText;
        signalCell.className = getSignalClass(signalText);
    });
}

// FUNGSI UTAMA MENGGUNAKAN DUA QUERY
async function fetchAndRenderSignals() {
    statusMessage.textContent = 'Mengambil data sinyal dan harga...';
    
    try {
        // --- QUERY 1: Ambil data indikator (tanpa join) ---
        const { data: indicators, error: indicatorError } = await supabaseClient 
            .from('indikator_teknikal')
            .select(`"Kode Saham", "Tanggal", "Sinyal_MA", "Sinyal_RSI", "Sinyal_MACD", "Sinyal_Volume"`)
            .order('Tanggal', { ascending: false })
            .limit(100); 

        if (indicatorError) throw indicatorError;
        if (indicators.length === 0) {
            statusMessage.textContent = 'Tidak ada data indikator ditemukan.';
            return;
        }

        // Tentukan Tanggal Terbaru
        const latestDate = indicators[0].Tanggal;

        // --- QUERY 2: Ambil data harga dan volume untuk tanggal terbaru ---
        const { data: prices, error: priceError } = await supabaseClient 
            .from('data_saham')
            .select(`"Kode Saham", "Penutupan", "Volume"`)
            .eq('Tanggal', latestDate); 

        if (priceError) throw priceError;
        
        // --- Langkah 3: Merge Data ---
        // Buat map harga untuk pencarian cepat: Key = "Kode Saham"
        const priceMap = {};
        prices.forEach(p => {
            priceMap[p["Kode Saham"]] = { Penutupan: p.Penutupan, Volume: p.Volume };
        });

        const mergedSignals = indicators
            .filter(i => 
                i.Tanggal === latestDate && // Filter Tanggal Terbaru
                (i.Sinyal_MA || i.Sinyal_RSI || i.Sinyal_MACD || i.Sinyal_Volume) // Filter Ada Sinyal
            )
            .map(i => {
                const priceData = priceMap[i["Kode Saham"]] || {};
                return { ...i, ...priceData }; // Gabungkan data sinyal dan data harga
            });


        if (mergedSignals.length === 0) {
            statusMessage.textContent = `Tidak ada sinyal terdeteksi pada tanggal ${latestDate}.`;
            Object.values(categories).forEach(({ tableEl }) => tableEl.style.display = 'none');
            Object.values(categories).forEach(({ statusEl }) => statusEl.style.display = 'block');
            return;
        }
        
        // 4. Kategorikan Data dan Render
        const categorizedData = categorizeSignals(mergedSignals);
        
        renderCategory('maCross', categorizedData.maCross);
        renderCategory('rsi', categorizedData.rsi);
        renderCategory('macd', categorizedData.macd);
        renderCategory('volume', categorizedData.volume);

        let totalSignals = Object.values(categorizedData).flat().length;
        statusMessage.textContent = `Sinyal untuk ${mergedSignals.length} saham terdeteksi pada ${latestDate}. Total ${totalSignals} Sinyal.`;

    } catch (error) {
        statusMessage.textContent = `Error memuat data: ${error.message}`;
        console.error('Error fetching data:', error);
    }
}

document.addEventListener('DOMContentLoaded', fetchAndRenderSignals);
