(function () {
  const { createClient } = supabase;

  const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const kodeSahamInput = document.getElementById("kodeSahamInput");
  const closePriceInput = document.getElementById("closePriceInput");
  const closeDateInput = document.getElementById("closeDateInput");
  const btnSave = document.getElementById("btnSave");
  const inputMessage = document.getElementById("inputMessage");

  const kodeSahamFilter = document.getElementById("kodeSahamFilter");
  const btnLoadTrend = document.getElementById("btnLoadTrend");
  const trendTableBody = document.getElementById("trendTableBody");

  // Helper: dapatkan / buat saham.id dari kode
  async function getOrCreateSahamId(kode) {
    const kodeUpper = kode.trim().toUpperCase();

    // cek sudah ada?
    let { data, error } = await db
      .from("saham")
      .select("id")
      .eq("kode", kodeUpper)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return data.id;
    }

    // kalau belum ada → insert baru
    const { data: insertData, error: insertError } = await db
      .from("saham")
      .insert({ kode: kodeUpper })
      .select("id")
      .single();

    if (insertError) throw insertError;
    return insertData.id;
  }

  // Event: Simpan harga close
  btnSave.addEventListener("click", async () => {
    inputMessage.textContent = "";

    try {
      const kode = kodeSahamInput.value;
      const closePrice = parseFloat(closePriceInput.value);
      let closeDate = closeDateInput.value;

      if (!kode || !closePrice) {
        inputMessage.textContent = "Kode saham dan harga close wajib diisi.";
        return;
      }

      if (!closeDate) {
        // default hari ini (format YYYY-MM-DD)
        const today = new Date();
        closeDate = today.toISOString().slice(0, 10);
      }

      const sahamId = await getOrCreateSahamId(kode);

      const { error } = await db.from("saham_harga").upsert(
        {
          saham_id: sahamId,
          close_date: closeDate,
          close_price: closePrice,
        },
        {
          onConflict: "saham_id,close_date",
        }
      );

      if (error) throw error;

      inputMessage.textContent = "Data tersimpan.";
      closePriceInput.value = "";
      // date boleh tetap biar input harian mudah
    } catch (err) {
      console.error(err);
      inputMessage.textContent = "Gagal menyimpan data.";
    }
  });

  // Event: Muat tren
  btnLoadTrend.addEventListener("click", async () => {
    trendTableBody.innerHTML = "";

    const kode = kodeSahamFilter.value.trim().toUpperCase();
    if (!kode) return;

    const { data, error } = await db
      .from("saham_tren_view")
      .select("*")
      .eq("kode", kode)
      .order("close_date", { ascending: false })  // terbaru dulu
      .limit(60);  // misal 60 hari terakhir

    if (error) {
      console.error(error);
      return;
    }

    data.forEach((row) => {
      const tr = document.createElement("tr");

      const cells = [
        row.close_date,
        row.kode,
        row.close_price?.toFixed(2),
        row.peak_price?.toFixed(2),
        row.ts1_price?.toFixed(2),
        row.ts2_price?.toFixed(2),
        row.ts3_price?.toFixed(2),
        row.drawdown_pct?.toFixed(2),
        row.signal,
        row.status_tren,
      ];

      cells.forEach((val) => {
        const td = document.createElement("td");
        td.textContent = val ?? "";
        tr.appendChild(td);
      });

      trendTableBody.appendChild(tr);
    });
  });
})();
