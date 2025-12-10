// Fungsi signalInfo dengan tambahan re-entry
function signalInfo(entry, last, high) {
  if (!entry || !last) {
    return { text: "DATA KURANG", className: "sig-hold", icon: "⚪" };
  }

  const gainPct = (last - entry) / entry;
  const cutLevel = entry * (1 + CUT_PCT);
  const tpLevel = entry * (1 + TP_PCT);
  const reentryLevel = high * 0.95;  // Re-entry level ketika harga naik setelah 5% penurunan

  if (last <= cutLevel) {
    return { text: "CUT LOSS -5%", className: "sig-cut", icon: "🛑" };
  }
  if (last >= tpLevel) {
    return { text: "ZONA TP +10%", className: "sig-tp", icon: "🎯" };
  }
  if (last >= reentryLevel && gainPct > 0) {
    return { text: "Re-Entry -5% Recovery", className: "sig-reentry", icon: "🔄" };
  }
  if (gainPct > 0) {
    return { text: "PROFIT RUN", className: "sig-run", icon: "🚀" };
  }
  return { text: "HOLD", className: "sig-hold", icon: "⏸️" };
}

// Menambahkan gaya CSS untuk sinyal re-entry
/* Add to the CSS */
.sig-reentry {
  background: rgba(248, 177, 113, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(248, 177, 113, 0.7);
}

// Perbarui renderDashboard untuk menambahkan sinyal re-entry ke kartu saham
function renderDashboard() {
  if (!currentRows.length) {
    summaryRow.innerHTML = `
      <div class="summary-chip">
        ℹ️ <span>Belum ada data. Tambahkan minimal satu saham lewat panel kiri.</span>
      </div>
    `;
    cardsContainer.innerHTML = `<div class="empty-state">Belum ada data.</div>`;
    return;
  }

  const cards = [];
  for (const row of currentRows) {
    const entry = parseNum(row.entry_price);
    const last = parseNum(row.last_price);
    let high = parseNum(row.highest_price_after_entry);

    if (!high && entry) high = entry;
    const gainPct = entry && last ? ((last - entry) / entry) * 100 : null;

    if (entry && last) {
      const sig = signalInfo(entry, last, high);  // Tambahkan high untuk sinyal re-entry
      cards.push({
        id: row.id,
        kode: row.kode,
        entry,
        last,
        high,
        gainPct,
        sig
      });
    }
  }

  // Render kembali kartu saham dengan sinyal re-entry
  cardsContainer.innerHTML = `
    <div class="cards-grid">
      ${cards.map((c) => {
        const gainClass = classForGain(c.gainPct);
        return `
          <div class="stock-card" data-id="${c.id}">
            <div class="stock-main">
              <div class="stock-code">${c.kode || "-"}</div>
              <div class="signal-pill ${c.sig.className}">
                <span>${c.sig.icon}</span>
                <span>${c.sig.text}</span>
              </div>
              <div class="stock-gain ${gainClass}">
                ${c.gainPct === null ? "-" : formatPct(c.gainPct)}
              </div>
            </div>
            <div class="stock-rows">
              <div>
                <div class="row-label">ENTRY</div>
                <div class="row-value">${formatNum(c.entry)}</div>
              </div>
              <div>
                <div class="row-label">HIGH</div>
                <div class="row-value">${formatNum(c.high)}</div>
              </div>
              <div>
                <div class="row-label">LAST</div>
                <div class="row-value">${formatNum(c.last)}</div>
              </div>
            </div>
            <div class="ts-row">
              <span class="ts1">TS1 -5%: ${c.ts1 ? formatNum(c.ts1) : "-"}</span>
              <span class="ts2">TS2 -10%: ${c.ts2 ? formatNum(c.ts2) : "-"}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}