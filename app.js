// app.js - Perubahan pada fungsi togglePortfolioStatus

// FUNGSI UPDATE STATUS PORTFOLIO (SIMETRI DAN PENGHAPUSAN OPSI TANGGAL BELI)
async function togglePortfolioStatus(stockCode, currentIsOwned) {
    // A. LOGIKA HAPUS (JIKA SUDAH PUNYA)
    if (currentIsOwned) {
        const result = await Swal.fire({
            title: `Hapus ${stockCode}?`,
            text: "Saham ini akan dihapus dari pemantauan portofolio Anda.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Ya, Hapus',
            cancelButtonText: 'Batal'
        });

        if (result.isConfirmed) {
            try {
                await supabaseClient.from('portofolio_saham').delete().eq('kode_saham', stockCode);
                globalPortfolio.delete(stockCode);
                if(globalPortfolioAnalysis) globalPortfolioAnalysis.delete(stockCode);

                Swal.fire({ icon: 'success', title: 'Dihapus!', text: `${stockCode} dihapus dari portofolio.`, timer: 1500, showConfirmButton: false });
            } catch (error) { 
                Swal.fire({ icon: 'error', title: 'Gagal', text: error.message });
                return false; 
            }
        } else { return false; }

    // B. LOGIKA TAMBAH/BELI BARU (Simetri UI dan Hapus Input Duplikat)
    } else {
        const latestPrice = await getLatestStockPrice(stockCode);
        const latestDate = dateFilter.value; // Tanggal Beli = Tanggal Analisis Terakhir
        
        if (!latestPrice) { 
            Swal.fire({ icon: 'error', title: 'Data Tidak Tersedia', text: 'Harga saham ini belum tersedia.' });
            return false; 
        }

        // Popup Input Harga (Satu Input Field Saja)
        const { value: inputPrice } = await Swal.fire({
            title: `Tambah ${stockCode}`,
            html: `
                <p style="margin-bottom: 10px; color: #6b7280;">Harga penutupan terakhir (${latestDate}): <b>Rp ${formatNumber(latestPrice, false, true)}</b></p>
                <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    <label for="swal-input-price" style="display:block; text-align:center; font-size:0.9rem; font-weight:600; margin-bottom:5px;">Masukkan Harga Beli:</label>
                    <input id="swal-input-price" class="swal2-input" type="number" value="${latestPrice}" min="1" step="1" style="width: 80%; margin-top: 0; text-align: center;">
                </div>
            `,
            input: 'text', // Menggunakan 'text' untuk mengontrol input HTML secara penuh
            showCancelButton: true,
            focusConfirm: false,
            preConfirm: () => { 
                const price = document.getElementById('swal-input-price').value;
                if (!price || parseFloat(price) <= 0) {
                    Swal.showValidationMessage('Harga beli harus valid dan lebih dari Rp 0!');
                    return false;
                }
                // Mengizinkan harga beli yang berbeda (historis)
                return parseFloat(price);
            },
            confirmButtonColor: '#4f46e5',
            confirmButtonText: 'Simpan',
            cancelButtonText: 'Batal'
        });
        
        // Pengecekan inputPrice setelah preConfirm
        if (inputPrice && inputPrice > 0) {
            try {
                // Saat menyimpan, kita menggunakan harga yang diinput pengguna (inputPrice)
                await supabaseClient.from('portofolio_saham').upsert({ 
                    kode_saham: stockCode, 
                    harga_beli: inputPrice, 
                    tanggal_beli: latestDate, // Menggunakan tanggal analisis sebagai tanggal beli
                    harga_tertinggi_sejak_beli: inputPrice 
                }, { onConflict: 'kode_saham' });
                
                globalPortfolio.set(stockCode, { hargaBeli: inputPrice });
                await fetchPortfolio();
                
                Swal.fire({ icon: 'success', title: 'Berhasil!', text: `${stockCode} disimpan dengan harga Rp ${formatNumber(inputPrice, false, true)}.`, timer: 2000, showConfirmButton: false });
            } catch (error) { 
                Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: error.message });
                return false; 
            }
        } else { return false; }
    }
    
    if (currentModalStockCode === stockCode) updatePortfolioStatusDisplay(stockCode);
    categorizeAndRender(applySignalFilter(globalCombinedSignals, signalFilter.value));
    return true;
}
