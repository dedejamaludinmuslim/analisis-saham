// ... (Bagian atas kode, inisialisasi, dan fungsi getSignalClass tetap sama)

// Fungsi utama untuk mengambil dan menampilkan data
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
                
                -- *** PENAMBAHAN JOIN DATA SAHAM ***
                data_saham ("Penutupan", "Volume")
                -- **********************************
            `)
            .order('Tanggal', { ascending: false })
            .limit(100); 
// ... (Sisa kode untuk filter dan kategorisasi tetap sama)

// ... (Sisa kode untuk filter dan kategorisasi tetap sama)
