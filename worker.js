// worker.js
import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Harus set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Helper: waktu sekarang di Asia/Jakarta
 */
function nowJakarta() {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type).value;

  const isoLike = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  return new Date(isoLike);
}

/**
 * Helper: tanggal (YYYY-MM-DD) di Asia/Jakarta
 */
function todayJakartaDateString() {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date()); // "YYYY-MM-DD"
}

/**
 * Cek apakah sekarang jam market (08:30–15:30 WIB)
 */
function isMarketHours(d) {
  const h = d.getHours();
  const m = d.getMinutes();

  // 08:30 <= time < 15:30
  const afterOpen =
    (h > 8) || (h === 8 && m >= 30);
  const beforeClose =
    (h < 15) || (h === 15 && m <= 30);

  return afterOpen && beforeClose;
}

/**
 * Ambil system_status (id=1)
 */
async function getSystemStatus() {
  const { data, error } = await db
    .from('system_status')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Gagal baca system_status:', error);
    return null;
  }
  return data;
}

/**
 * Update system_status
 */
async function updateSystemStatus({ lastAutoUpdateAt, lastOutOfHoursRun }) {
  const payload = {};
  if (lastAutoUpdateAt) payload.last_auto_update_at = lastAutoUpdateAt;
  if (lastOutOfHoursRun) payload.last_out_of_hours_run = lastOutOfHoursRun;

  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from('system_status')
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);

  if (error) {
    console.error('Gagal update system_status:', error);
  }
}

/**
 * Ambil daftar saham yang di-track
 */
async function getTrackedStocks() {
  const { data, error } = await db
    .from('saham')
    .select('id, kode, yahoo_symbol, is_tracked')
    .eq('is_tracked', true);

  if (error) {
    console.error('Gagal ambil daftar saham:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log('Tidak ada saham dengan is_tracked = true.');
    return [];
  }

  return data.map((row) => {
    const symbol = row.yahoo_symbol && row.yahoo_symbol.trim()
      ? row.yahoo_symbol.trim()
      : `${row.kode.trim().toUpperCase()}.JK`;
    return {
      id: row.id,
      kode: row.kode.trim().toUpperCase(),
      yahooSymbol: symbol
    };
  });
}

/**
 * Bagi array jadi chunk (misal 50 symbol per call)
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Panggil Yahoo Finance untuk sekumpulan simbol
 */
async function fetchYahooQuotes(symbols) {
  if (!symbols || symbols.length === 0) return {};

  const query = symbols.join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error('Gagal fetch Yahoo:', res.status, await res.text());
    throw new Error('Yahoo request failed');
  }

  const json = await res.json();
  const results = json?.quoteResponse?.result || [];

  const map = {};
  for (const item of results) {
    if (!item.symbol || item.regularMarketPrice == null) continue;
    map[item.symbol] = item;
  }
  return map;
}

/**
 * Jalankan update harga:
 * - baca saham yang di-track
 * - fetch harga dari Yahoo
 * - upsert ke saham_harga
 * - update system_status
 */
async function runPriceUpdate() {
  const nowJkt = nowJakarta();
  const todayStr = todayJakartaDateString();
  console.log(`[INFO] Mulai update @ ${nowJkt.toISOString()} (Jakarta date = ${todayStr})`);

  const stocks = await getTrackedStocks();
  if (stocks.length === 0) {
    return;
  }

  // mapping id -> yahoo symbol & sebaliknya
  const symbolMap = {}; // symbol -> array of { id, kode }
  for (const s of stocks) {
    if (!symbolMap[s.yahooSymbol]) symbolMap[s.yahooSymbol] = [];
    symbolMap[s.yahooSymbol].push({ id: s.id, kode: s.kode });
  }

  const allSymbols = Object.keys(symbolMap);
  const chunks = chunkArray(allSymbols, 50); // batch 50 symbol per call

  const rows = [];

  for (const chunk of chunks) {
    const quoteMap = await fetchYahooQuotes(chunk);

    for (const symbol of chunk) {
      const quote = quoteMap[symbol];
      if (!quote || quote.regularMarketPrice == null) {
        console.warn(`[WARN] Tidak ada harga untuk simbol ${symbol}`);
        continue;
      }
      const price = quote.regularMarketPrice;

      // simbol bisa mapping ke beberapa saham_id (harusnya 1, tapi kita support array)
      const mapped = symbolMap[symbol] || [];
      for (const item of mapped) {
        rows.push({
          saham_id: item.id,
          close_date: todayStr,
          close_price: price
        });
      }
    }
  }

  if (rows.length === 0) {
    console.warn('Tidak ada baris harga yang bisa di-upsert (rows kosong).');
    return;
  }

  console.log(`[INFO] Akan upsert ${rows.length} baris ke saham_harga...`);

  const { error } = await db
    .from('saham_harga')
    .upsert(rows, {
      onConflict: 'saham_id,close_date'
    });

  if (error) {
    console.error('Gagal upsert saham_harga:', error);
    throw error;
  }

  console.log('[INFO] Upsert selesai.');
}

/**
 * Wrapper: honor aturan jam:
 * - 08:30–15:30: selalu jalan
 * - di luar itu: minimal 2 jam sekali
 */
export async function runOnce() {
  const nowJkt = nowJakarta();
  const market = isMarketHours(nowJkt);

  console.log(`[INFO] runOnce @ Jakarta time = ${nowJkt.toISOString()} (marketHours=${market})`);

  const status = await getSystemStatus();

  if (!market) {
    // cek apakah sudah 2 jam sejak last_out_of_hours_run
    if (status && status.last_out_of_hours_run) {
      const last = new Date(status.last_out_of_hours_run);
      const diffMs = nowJkt.getTime() - last.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 2) {
        console.log(`[INFO] Off-hours, tapi baru ${diffHours.toFixed(2)} jam sejak run terakhir. Skip.`);
        return;
      }
    }
  }

  // Jalankan update harga
  await runPriceUpdate();

  // Update system_status
  const payload = { lastAutoUpdateAt: nowJkt.toISOString() };
  if (!market) {
    payload.lastOutOfHoursRun = nowJkt.toISOString();
  }
  await updateSystemStatus(payload);

  console.log('[INFO] runOnce selesai.');
}

// Kalau langsung dijalankan via `node worker.js`:
if (import.meta && import.meta.url === `file://${process.argv[1]}`) {
  runOnce()
    .then(() => {
      console.log('Selesai tanpa error.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error fatal di runOnce:', err);
      process.exit(1);
    });
}
