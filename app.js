// ==========================================
// UPDATE FUNGSI INI DI APP.JS
// ==========================================
async function showStockDetailModal(stockCode) {
    currentModalStockCode = stockCode; 
    modalTitle.textContent = stockCode; 
    modalCompanyName.textContent = "Memuat data..."; 
    document.getElementById('fundamentalRatios').innerHTML = ''; // Hapus rasio lama
    updatePortfolioStatusDisplay(stockCode);
    stockDetailModal.style.display = 'flex'; 
    
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="7">Memuat...</td></tr>';
    if(priceChart) priceChart.destroy();
    
    try {
        const { data: indicators } = await supabaseClient
            .from('indikator_teknikal')
            .select('*')
            .eq('Kode Saham', stockCode)
            .order('Tanggal', { ascending: false })
            .limit(60); // Menggunakan 60 hari sesuai rekomendasi

        if(!indicators || !indicators.length) { 
            rawIndicatorTableBody.innerHTML = '<tr><td colspan="7">Data kosong</td></tr>'; 
            modalCompanyName.textContent = "Data tidak ditemukan"; return; 
        }
        
        const dates = indicators.map(i => i.Tanggal);
        const { data: prices } = await supabaseClient.from('data_saham')
            .select(`"Tanggal Perdagangan Terakhir", "Penutupan", "Nama Perusahaan", "PER", "PBV"`) // TAMBAH PER & PBV
            .eq('Kode Saham', stockCode)
            .in('Tanggal Perdagangan Terakhir', dates)
            .order('Tanggal Perdagangan Terakhir', { ascending: false }) // Ambil yang terbaru
            .limit(1); // Ambil data terakhir untuk fundamental
            
        const latestData = prices?.[0];

        if (latestData) {
            modalCompanyName.textContent = latestData["Nama Perusahaan"] || "Nama Perusahaan Tidak Ditemukan";
            
            // TAMPILKAN RASIO FUNDAMENTAL
            const per = formatNumber(latestData["PER"], false, false);
            const pbv = formatNumber(latestData["PBV"], false, false);
            document.getElementById('fundamentalRatios').innerHTML = `
                <div class="fundamental-tag">PER: <span class="${latestData["PER"] && latestData["PER"] > 15 ? 'text-red' : 'text-green'}">${per}</span></div>
                <div class="fundamental-tag">PBV: <span class="${latestData["PBV"] && latestData["PBV"] > 2 ? 'text-red' : 'text-green'}">${pbv}</span></div>
            `;
            
        } else {
            modalCompanyName.textContent = "Data fundamental tidak ditemukan";
        }

        const priceMap = new Map(); 
        prices?.forEach(p => priceMap.set(p["Tanggal Perdagangan Terakhir"], p.Penutupan));
        const histData = indicators.map(i => ({ ...i, Penutupan: priceMap.get(i.Tanggal) })).reverse();
        
        // ... (Logika Chart dan Tabel Historis Tetap Sama)
        
        rawIndicatorTableBody.innerHTML = '';
        [...histData].reverse().forEach(d => {
            const r = rawIndicatorTableBody.insertRow();
            r.insertCell().textContent = d.Tanggal; 
            r.insertCell().textContent = formatNumber(d.Penutupan, false, true); 
            r.insertCell().textContent = parseFloat(d.RSI||0).toFixed(2); 
            r.insertCell().textContent = parseFloat(d.MACD_Line||0).toFixed(2); 
            r.insertCell().textContent = parseFloat(d.Signal_Line||0).toFixed(2); 
            r.insertCell().textContent = formatNumber(d.MA_5, false, true); 
            r.insertCell().textContent = formatNumber(d.MA_20, false, true);
        });

        const ctx = document.getElementById('priceIndicatorChart').getContext('2d');
        priceChart = new Chart(ctx, { 
            type: 'line', 
            data: { labels: histData.map(d => d.Tanggal.slice(5)), datasets: [ { label: 'Harga', data: histData.map(d => d.Penutupan), borderColor: '#4f46e5', tension: 0.1, yAxisID: 'y' }, { label: 'MA5', data: histData.map(d => d.MA_5), borderColor: '#f43f5e', borderWidth:1, pointRadius:0, yAxisID: 'y' }, { label: 'MA20', data: histData.map(d => d.MA_20), borderColor: '#0ea5e9', borderWidth:1, pointRadius:0, yAxisID: 'y' } ] }, 
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left', grid: { display: false } } }, plugins: { legend: { labels: { boxWidth: 10 } } } } 
        });
    } catch (e) { rawIndicatorTableBody.innerHTML = `<tr><td colspan="7">Error: ${e.message}</td></tr>`; }
}
