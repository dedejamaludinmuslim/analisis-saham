// KREDENSIAL SUPABASE (Ganti dengan milik Anda)
const SUPABASE_URL = "https://tcibvigvrugvdwlhwsdb.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWJ2aWd2cnVndmR3bGh3c2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzUzNzAsImV4cCI6MjA4MDc1MTM3MH0.pBb6SQeFIMLmBTJZnxSQ2qDtNT1Cslw4c5jeXLeFQDs"; 

const { createClient } = window.supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

// DOM Elements
const statusMessage = document.getElementById('statusMessage');
const dateFilter = document.getElementById('dateFilter'); 
const signalFilter = document.getElementById('signalFilter');
const stockSearchInput = document.getElementById('stockSearchInput');
const searchResults = document.getElementById('searchResults');
const stockDetailModal = document.getElementById('stockDetailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const btnUploadCsv = document.getElementById('btnUploadCsv');
const csvFileInput = document.getElementById('csvFileInput');

// Portfolio Form Elements
const chkOwned = document.getElementById('chkOwned');
const portfolioInputs = document.getElementById('portfolioInputs');
const inputBuyDate = document.getElementById('inputBuyDate');
const inputBuyPrice = document.getElementById('inputBuyPrice');
const btnSavePortfolio = document.getElementById('btnSavePortfolio');
let currentModalStock = null; // Menyimpan kode saham yang sedang dibuka di modal

// State Global
let globalCombinedSignals = [];
let globalCustomMASignals = []; 
let globalPortfolio = new Map(); 
let sortState = { column: 'Kode Saham', direction: 'asc' }; 
let priceChart = null;

// ==========================================
// 1. FITUR PENCARIAN (SEARCH BAR)
// ==========================================
stockSearchInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.toUpperCase();
    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    // Cari di tabel data_saham (distinct codes)
    const { data, error } = await supabaseClient
        .from('data_saham')
        .select('"Kode Saham"')
        .ilike('Kode Saham', `%${query}%`)
        .limit(10); // Batasi hasil

    if (data && data.length > 0) {
        // Hapus duplikat karena data_saham menyimpan harian
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

// Sembunyikan search result jika klik di luar
document.addEventListener('click', (e) => {
    if (!stockSearchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ==========================================
// 2. FITUR UPLOAD CSV (DATA BARU)
// ==========================================
btnUploadCsv.addEventListener('click', () => {
    const file = csvFileInput.files[0];
    if (!file) {
        alert('Pilih file CSV terlebih dahulu!');
        return;
    }

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const rows = results.data;
            if (rows.length === 0) return;

            statusMessage.textContent = `Mengupload ${rows.length} baris data...`;
            
            // Validasi header sederhana
            const firstRow = rows[0];
            if (!firstRow.hasOwnProperty('Kode Saham') || !firstRow.hasOwnProperty('Penutupan')) {
                alert('Format CSV salah! Pastikan header sesuai database (Kode Saham, Penutupan, dll).');
                return;
            }

            // Batch Insert untuk menghindari limit payload Supabase
            const BATCH_SIZE = 100;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                
                // Bersihkan data jika ada field kosong atau format salah
                const cleanBatch = batch.map(row => ({
                    "Kode Saham": row["Kode Saham"],
                    "Tanggal Perdagangan Terakhir": row["Tanggal Perdagangan Terakhir"] || row["Tanggal"], // Support nama kolom alternatif
                    "Penutupan": row["Penutupan"],
                    "Volume": row["Volume"],
                    "Selisih": row["Selisih"],
                    // Tambahkan kolom lain jika ada di CSV
                    "Open Price": row["Open Price"],
                    "Tertinggi": row["Tertinggi"],
                    "Terendah": row["Terendah"]
                }));

                const { error } = await supabaseClient
                    .from('data_saham')
                    .upsert(cleanBatch, { onConflict: 'Kode Saham, Tanggal Perdagangan Terakhir' });

                if (error) {
                    console.error('Error upload batch:', error);
                    alert(`Gagal upload di baris ${i}. Cek console.`);
                    return;
                }
            }

            alert('Upload Berhasil! Halaman akan dimuat ulang.');
            location.reload();
        }
    });
});

// ==========================================
// 3. LOGIKA UTAMA (LOAD DATA & RENDER)
// ==========================================

async function fetchPortfolio() {
    const { data } = await supabaseClient.from('portofolio_saham').select('*');
    if (data) {
        globalPortfolio = new Map(data.map(item => [item.kode_saham, item]));
    }
}

async function fetchAndRenderSignals(selectedDate = null) {
    statusMessage.textContent = 'Memuat data...';
    await fetchPortfolio();

    // 1. Ambil Sinyal
    let query = supabaseClient.from('indikator_teknikal').select('*').order('Tanggal', { ascending: false });
    if (selectedDate) query = query.eq('Tanggal', selectedDate);
    else query = query.limit(200); // Batas awal agar tidak berat

    const { data: signals, error } = await query;
    if (error || !signals.length) {
        statusMessage.textContent = 'Data sinyal tidak ditemukan.';
        return;
    }

    const dateToFilter = selectedDate || signals[0].Tanggal;
    if (!selectedDate) populateDateFilter(dateToFilter);

    // 2. Ambil Harga (Penutupan)
    const { data: prices } = await supabaseClient
        .from('data_saham')
        .select('"Kode Saham", Penutupan, Volume, Selisih')
        .eq('Tanggal Perdagangan Terakhir', dateToFilter);

    const priceMap = new Map();
    if (prices) prices.forEach(p => priceMap.set(p["Kode Saham"], p));

    // 3. Gabungkan
    globalCombinedSignals = signals.map(s => {
        const p = priceMap.get(s["Kode Saham"]) || {};
        return { ...s, ...p }; // Gabung objek sinyal dan harga
    }).filter(item => item.Penutupan); // Hanya yang punya data harga

    renderTable(globalCombinedSignals);
}

// Render Tabel Utama
function renderTable(data) {
    const tbody = document.querySelector('#mainTable tbody');
    tbody.innerHTML = '';

    // Filter
    const filtered = data.filter(item => {
        if (signalFilter.value === 'ALL') return true;
        const sig = (item.Sinyal_MA || '') + (item.Sinyal_RSI || '');
        if (signalFilter.value === 'BUY') return sig.includes('BUY') || sig.includes('GOLDEN');
        if (signalFilter.value === 'SELL') return sig.includes('SELL') || sig.includes('DEAD');
        return false;
    });

    // Sorting Sederhana (Default Kode Saham)
    filtered.sort((a, b) => a["Kode Saham"].localeCompare(b["Kode Saham"]));

    filtered.forEach(item => {
        const row = tbody.insertRow();
        const code = item["Kode Saham"];
        const owned = globalPortfolio.get(code);

        // Kolom Kode
        const cellCode = row.insertCell();
        cellCode.textContent = code;
        cellCode.className = 'clickable-stock';
        cellCode.onclick = () => showStockDetailModal(code);

        // Kolom Status
        row.insertCell().innerHTML = owned 
            ? `<span style="background:#e0f2fe; color:#0284c7; padding:2px 6px; border-radius:4px; font-size:0.8em;">OWNED</span>` 
            : `<span style="color:#aaa;">-</span>`;

        // Kolom Harga Beli
        row.insertCell().textContent = owned ? formatRupiah(owned.harga_beli) : '-';

        // Kolom P/L
        const cellPL = row.insertCell();
        if (owned) {
            const pl = ((item.Penutupan - owned.harga_beli) / owned.harga_beli) * 100;
            cellPL.textContent = `${pl > 0 ? '+' : ''}${pl.toFixed(2)}%`;
            cellPL.style.color = pl >= 0 ? 'var(--buy-color)' : 'var(--sell-color)';
            cellPL.style.fontWeight = 'bold';
        } else {
            cellPL.textContent = '-';
        }

        row.insertCell().textContent = item.Tanggal;
        row.insertCell().textContent = formatRupiah(item.Penutupan);
        row.insertCell().textContent = formatVolume(item.Volume);
        
        // Sinyal (Gabungan Text)
        const sigText = [item.Sinyal_MA, item.Sinyal_RSI].filter(Boolean).join(', ');
        const cellSig = row.insertCell();
        cellSig.textContent = sigText;
        if(sigText.includes('BUY')) cellSig.className = 'signal-buy';
        if(sigText.includes('SELL')) cellSig.className = 'signal-sell';
    });

    statusMessage.textContent = `Menampilkan ${filtered.length} saham.`;
}

// ==========================================
// 4. MANAJEMEN PORTOFOLIO (DI DALAM MODAL)
// ==========================================

// Event Listener Checkbox Owned
chkOwned.addEventListener('change', (e) => {
    portfolioInputs.style.display = e.target.checked ? 'block' : 'none';
});

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
                inputBuyPrice.value = '';
                inputBuyDate.value = '';
                await fetchPortfolio();
                fetchAndRenderSignals(dateFilter.value);
            }
        } else {
            chkOwned.checked = true; // Batal uncheck
            portfolioInputs.style.display = 'block';
        }
    }
});


// ==========================================
// 5. MODAL DETAIL & CHART
// ==========================================

async function showStockDetailModal(stockCode) {
    currentModalStock = stockCode;
    modalTitle.textContent = `Detail Saham ${stockCode}`;
    stockDetailModal.style.display = 'flex';
    
    // Reset Form Portofolio
    const portfolioData = globalPortfolio.get(stockCode);
    if (portfolioData) {
        chkOwned.checked = true;
        portfolioInputs.style.display = 'block';
        inputBuyPrice.value = portfolioData.harga_beli;
        inputBuyDate.value = portfolioData.tanggal_beli;
    } else {
        chkOwned.checked = false;
        portfolioInputs.style.display = 'none';
        inputBuyPrice.value = '';
        inputBuyDate.value = '';
    }

    // Load Data Chart
    const { data: history } = await supabaseClient
        .from('indikator_teknikal')
        .select('Tanggal, MA_5, MA_20, RSI, MACD_Line') // Ambil indikator
        .eq('Kode Saham', stockCode)
        .order('Tanggal', { ascending: false })
        .limit(30);

    // Kita butuh harga penutupan juga untuk chart
    // (Asumsi: Ambil harga dari tabel data_saham secara terpisah atau join jika mau)
    // Untuk simplifikasi, kita ambil indikator saja dulu, tapi idealnya ambil harga.
    // Mari ambil harga:
    const dates = history.map(h => h.Tanggal);
    const { data: prices } = await supabaseClient
        .from('data_saham')
        .select('Penutupan, "Tanggal Perdagangan Terakhir"')
        .eq('Kode Saham', stockCode)
        .in('Tanggal Perdagangan Terakhir', dates);
    
    const priceMap = new Map();
    prices.forEach(p => priceMap.set(p["Tanggal Perdagangan Terakhir"], p.Penutupan));

    const chartData = history.map(h => ({
        ...h,
        Close: priceMap.get(h.Tanggal)
    })).reverse(); // Urutkan lama -> baru

    renderChart(chartData);
    renderHistoryTable(history); // Tampilkan tabel kecil di modal
}

function renderChart(data) {
    const ctx = document.getElementById('priceIndicatorChart').getContext('2d');
    if (priceChart) priceChart.destroy();

    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.Tanggal),
            datasets: [
                { label: 'Harga', data: data.map(d => d.Close), borderColor: '#4f46e5', yAxisID: 'y' },
                { label: 'MA5', data: data.map(d => d.MA_5), borderColor: '#f59e0b', borderWidth: 1, pointRadius: 0, yAxisID: 'y' },
                { label: 'MA20', data: data.map(d => d.MA_20), borderColor: '#ef4444', borderWidth: 1, pointRadius: 0, yAxisID: 'y' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { position: 'left' } }
        }
    });
}

function renderHistoryTable(data) {
    const tbody = document.querySelector('#rawIndicatorTable tbody');
    tbody.innerHTML = '';
    data.forEach(d => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${d.Tanggal}</td><td>-</td><td>${d.RSI?.toFixed(2)}</td><td>${d.MACD_Line?.toFixed(2)}</td><td>${d.MA_5}</td><td>${d.MA_20}</td>`;
    });
}

// ==========================================
// UTILS & INIT
// ==========================================
function formatRupiah(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatVolume(num) { 
    if (num >= 1e9) return (num / 1e9).toFixed(2) + ' M';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + ' Jt';
    return num;
}

async function populateDateFilter(currentDate) {
    const { data } = await supabaseClient.from('indikator_teknikal').select('Tanggal').order('Tanggal', {ascending:false}).limit(30);
    const uniqueDates = [...new Set(data.map(d => d.Tanggal))];
    dateFilter.innerHTML = '';
    dateFilter.disabled = false;
    uniqueDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        if(d === currentDate) opt.selected = true;
        dateFilter.appendChild(opt);
    });
    dateFilter.onchange = (e) => fetchAndRenderSignals(e.target.value);
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    closeModalBtn.onclick = () => stockDetailModal.style.display = 'none';
    
    // Load Kustom MA Logic (RPC) - Sambungkan tombol
    document.getElementById('applyMaCustom').onclick = async () => {
        const maFast = document.getElementById('maFast').value;
        const maSlow = document.getElementById('maSlow').value;
        const date = dateFilter.value;
        statusMessage.textContent = 'Menghitung MA Kustom...';
        
        const { data, error } = await supabaseClient.rpc('get_custom_ma_signals', {
            ma_fast_period: parseInt(maFast), ma_slow_period: parseInt(maSlow), target_date: date
        });
        
        if(!error) {
            // Gabungkan hasil RPC dengan data harga saat ini untuk ditampilkan
            // Logic ini perlu penyesuaian di `globalCustomMASignals` jika ingin mengganti tabel utama
            alert('Fitur RPC terhubung. Data: ' + data.length + ' saham.');
            // Implementasi detail render kustom MA bisa disisipkan di sini.
        }
    };

    fetchAndRenderSignals();
});
