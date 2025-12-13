// ==========================================
// 9. MODAL DETAIL & FUNDAMENTAL (Tahap 1 & 3) - CODE PERBAIKAN
// ==========================================
async function showStockDetailModal(stockCode) {
    currentModalStockCode = stockCode; 
    modalTitle.textContent = stockCode; 
    modalCompanyName.textContent = "Memuat data..."; 
    document.getElementById('fundamentalRatios').innerHTML = '';
    updatePortfolioStatusDisplay(stockCode);
    stockDetailModal.style.display = 'flex'; 
    
    rawIndicatorTableBody.innerHTML = '<tr><td colspan="8">Memuat...</td></tr>'; 
    if(priceChart) priceChart.destroy();
    
    try {
        // BAGIAN 1: Ambil data fundamental (Nama Perusahaan, PER, PBV) dari data terbaru
        // Kita hanya ambil 1 baris terbaru dari data_saham
        const { data: latestFundamental } = await supabaseClient.from('data_saham')
            .select(`"Nama Perusahaan", "PER", "PBV"`) 
            .eq('Kode Saham', stockCode)
            .order('Tanggal Perdagangan Terakhir', { ascending: false })
            .limit(1); 
            
        const fundamentalData = latestFundamental?.[0];

        // BAGIAN 2: Ambil Indikator (ATR, MA, RSI, dll.)
        const { data: indicators } = await supabaseClient
            .from('indikator_teknikal')
            .select(`*, "ATR_14"`) 
            .eq('Kode Saham', stockCode)
            .order('Tanggal', { ascending: false })
            .limit(60); 

        if(!indicators || !indicators.length) { 
            rawIndicatorTableBody.innerHTML = '<tr><td colspan="8">Data indikator kosong</td></tr>'; 
            modalCompanyName.textContent = "Data indikator tidak ditemukan"; 
            return; 
        }
        
        const dates = indicators.map(i => i.Tanggal);
        
        // BAGIAN 3: Ambil Harga Historis (Penutupan) untuk 60 hari indikator
        const { data: prices } = await supabaseClient.from('data_saham')
            .select(`"Tanggal Perdagangan Terakhir", "Penutupan"`) 
            .eq('Kode Saham', stockCode)
            .in('Tanggal Perdagangan Terakhir', dates); // Filter ini hanya untuk harga historis
            
        // ========================================================
        // RENDERING DATA FUNDAMENTAL & NAMA PERUSAHAAN (DARI BAGIAN 1)
        // ========================================================
        if (fundamentalData) {
            modalCompanyName.textContent = fundamentalData["Nama Perusahaan"] || "Nama Perusahaan Tidak Ditemukan";
            
            // TAMPILKAN RASIO FUNDAMENTAL HANYA JIKA ADA NILAI
            const hasFundamental = fundamentalData["PER"] || fundamentalData["PBV"];
            
            if (hasFundamental) {
                const per = formatNumber(fundamentalData["PER"], false, false);
                const pbv = formatNumber(fundamentalData["PBV"], false, false);
                document.getElementById('fundamentalRatios').innerHTML = `
                    <div class="fundamental-tag">PER: <span class="${fundamentalData["PER"] && fundamentalData["PER"] > 15 ? 'text-red' : 'text-green'}">${per}</span></div>
                    <div class="fundamental-tag">PBV: <span class="${fundamentalData["PBV"] && fundamentalData["PBV"] > 2 ? 'text-red' : 'text-green'}">${pbv}</span></div>
                `;
            } else {
                 document.getElementById('fundamentalRatios').innerHTML = '';
            }
            
        } else {
            modalCompanyName.textContent = "Nama perusahaan & Fundamental tidak ditemukan";
        }

        // ========================================================
        // RENDERING TABEL & GRAFIK (DARI BAGIAN 2 & 3)
        // ========================================================
        
        const priceMap = new Map(); prices?.forEach(p => priceMap.set(p["Tanggal Perdagangan Terakhir"], p.Penutupan));
        const histData = indicators.map(i => ({ ...i, Penutupan: priceMap.get(i.Tanggal) })).reverse();
        
        // PENGISIAN TABEL HISTORIS (Menampilkan ATR)
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
            r.insertCell().textContent = parseFloat(d.ATR_14||0).toFixed(2);
        });

        // GRAFIK
        const ctx = document.getElementById('priceIndicatorChart').getContext('2d');
        priceChart = new Chart(ctx, { 
            type: 'line', 
            data: { labels: histData.map(d => d.Tanggal.slice(5)), datasets: [ { label: 'Harga', data: histData.map(d => d.Penutupan), borderColor: '#4f46e5', tension: 0.1, yAxisID: 'y' }, { label: 'MA5', data: histData.map(d => d.MA_5), borderColor: '#f43f5e', borderWidth:1, pointRadius:0, yAxisID: 'y' }, { label: 'MA20', data: histData.map(d => d.MA_20), borderColor: '#0ea5e9', borderWidth:1, pointRadius:0, yAxisID: 'y' } ] }, 
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left', grid: { display: false } } }, plugins: { legend: { labels: { boxWidth: 10 } } } } 
        });
    } catch (e) { rawIndicatorTableBody.innerHTML = `<tr><td colspan="8">Error: ${e.message}</td></tr>`; }
}

function updatePortfolioStatusDisplay(code) { 
// ... (Bagian ini tidak berubah, hanya untuk konteks)
