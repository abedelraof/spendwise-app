// Pure data -> HTML for the /report card. No I/O, no Puppeteer, no DB, so it can
// be rendered straight into a browser via GET /api/reports/report.png?debug=html.
//
// Everything here must be self-contained: the renderer aborts every non-data:
// request, so there are no web fonts, no CDN stylesheets and no remote images.

const THEME = {
  bg: '#0f1115',
  card: '#1a1d24',
  cardAlt: '#21252e',
  border: '#2a2f3a',
  text: '#e7e9ee',
  muted: '#8b91a1',
  accent: '#4f8cff',
  green: '#2fbf71',
  amber: '#f5a524',
  red: '#f0455f',
};

// Used when a category has no color set in the DB.
const FALLBACK_COLORS = ['#4f8cff', '#2fbf71', '#f5a524', '#f0455f', '#a970ff', '#22c7d5', '#ff7ac6', '#8b91a1'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Compact form for chart axis labels, where two decimals are just noise.
function fmtShort(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  return v.toFixed(0);
}

function stateColor(state) {
  return state === 'over' ? THEME.red : state === 'warn' ? THEME.amber : THEME.green;
}

function shortDate(iso) {
  // 'YYYY-MM-DD' -> 'D Mon', parsed as UTC so it can't drift a day.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`;
}

function renderKpis(kpis) {
  return kpis.map(k => `
    <div class="tile">
      <div class="tile-label">${esc(k.label)}</div>
      <div class="tile-value">${esc(k.value)}${k.unit ? `<span class="tile-unit">${esc(k.unit)}</span>` : ''}</div>
      <div class="tile-meta">${esc(k.meta || '')}</div>
    </div>`).join('');
}

function renderCategories(categories, currency) {
  if (!categories.rows.length) {
    return `<div class="empty">No spending in this period.</div>`;
  }

  return `<div class="bars">${categories.rows.map((r, i) => {
    // The aggregate row is deliberately grey — giving it a palette color makes
    // it read as just another category.
    const color = r.isOther ? THEME.muted : (r.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
    return `
      <div class="bar-row">
        <div class="bar-label">
          <span class="dot" style="background:${esc(color)}"></span>
          <span class="bar-name">${esc(r.name)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${r.barPct}%;background:${esc(color)}"></div>
        </div>
        <div class="bar-value">
          ${esc(fmt(r.amount))} <span class="unit">${esc(currency)}</span>
          <span class="bar-pct">${r.percentage}%</span>
        </div>
      </div>`;
  }).join('')}</div>`;
}

function renderTrend(trend, currency) {
  if (trend.empty) {
    return `<div class="empty">No spending in this period.</div>`;
  }

  const pts = trend.points;
  const vMax = trend.max;

  // Plot area inside the 860x210 viewBox: left gutter for y labels, bottom for x labels.
  const X0 = 62, X1 = 848, Y0 = 14, Y1 = 172;
  const scaleY = v => Y1 - (v / vMax) * (Y1 - Y0);
  const scaleX = i => (pts.length === 1 ? (X0 + X1) / 2 : X0 + i * ((X1 - X0) / (pts.length - 1)));

  const gridlines = [vMax, vMax / 2].map(v => `
    <line x1="${X0}" y1="${scaleY(v).toFixed(1)}" x2="${X1}" y2="${scaleY(v).toFixed(1)}"
          stroke="${THEME.border}" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="${X0 - 10}" y="${(scaleY(v) + 4).toFixed(1)}" class="svg-axis" text-anchor="end">${esc(fmtShort(v))}</text>
  `).join('');

  // A single data point (e.g. /report today) can't form a polyline — draw a dot.
  let series;
  if (pts.length === 1) {
    const cx = scaleX(0), cy = scaleY(pts[0].total);
    series = `
      <line x1="${cx}" y1="${cy.toFixed(1)}" x2="${cx}" y2="${Y1}" stroke="${THEME.accent}" stroke-width="2" opacity="0.35"/>
      <circle cx="${cx}" cy="${cy.toFixed(1)}" r="6" fill="${THEME.accent}"/>`;
  } else {
    const coords = pts.map((p, i) => `${scaleX(i).toFixed(1)},${scaleY(p.total).toFixed(1)}`);
    series = `
      <path d="M${coords.join(' L')} L${X1},${Y1} L${X0},${Y1} Z" fill="url(#areaGrad)"/>
      <polyline points="${coords.join(' ')}" fill="none" stroke="${THEME.accent}"
                stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // First / middle / last only — more than three labels collides at this width.
  const labelIdx = pts.length === 1
    ? [0]
    : [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
  const xLabels = labelIdx.map(i => {
    const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
    return `<text x="${scaleX(i).toFixed(1)}" y="196" class="svg-axis" text-anchor="${anchor}">${esc(shortDate(pts[i].date))}</text>`;
  }).join('');

  return `
    <svg viewBox="0 0 860 210" class="trend" role="img">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${THEME.accent}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${THEME.accent}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${X0}" y1="${Y1}" x2="${X1}" y2="${Y1}" stroke="${THEME.border}" stroke-width="1"/>
      ${gridlines}
      ${series}
      ${xLabels}
    </svg>
    <div class="trend-foot">Peak day ${esc(fmt(vMax))} ${esc(currency)}</div>`;
}

function renderBudgets(budgets, currency) {
  const parts = [];

  if (budgets.cap) {
    const c = budgets.cap;
    const color = stateColor(c.state);
    parts.push(`
      <div class="cap">
        <div class="cap-head">
          <span>Monthly cap</span>
          <span class="cap-nums">${esc(fmt(c.spent))} / ${esc(fmt(c.cap))} ${esc(currency)}</span>
        </div>
        <div class="bar-track lg">
          <div class="bar-fill" style="width:${Math.min(100, c.pct)}%;background:${color}"></div>
        </div>
        <div class="cap-meta" style="color:${color}">
          ${c.pct}% spent · ${esc(fmt(Math.abs(c.remaining)))} ${esc(currency)} ${c.remaining >= 0 ? 'remaining' : 'over budget'}
        </div>
        <div class="cap-sub">Allocated across category budgets: ${esc(fmt(c.allocated))} ${esc(currency)}</div>
      </div>`);
  } else {
    parts.push(`<div class="empty sm">No monthly budget cap set.</div>`);
  }

  if (budgets.rows.length) {
    parts.push(`<div class="bars tight">${budgets.rows.map(r => {
      const color = stateColor(r.state);
      return `
        <div class="bar-row sm">
          <div class="bar-label"><span class="bar-name">${esc(r.name)}</span></div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.min(100, r.pct)}%;background:${color}"></div>
          </div>
          <div class="bar-value"><span class="bar-pct" style="color:${color}">${r.pct}%</span></div>
        </div>`;
    }).join('')}</div>`);
  } else {
    parts.push(`<div class="empty sm">No category budgets yet.</div>`);
  }

  return parts.join('');
}

function renderNetWorth(nw) {
  if (!nw.accountCount) {
    return `<div class="empty sm">No accounts yet.</div>`;
  }
  const sign = nw.netWorth >= 0 ? THEME.green : THEME.red;
  const note = nw.unconverted
    ? `<div class="nw-note">${nw.unconverted} account${nw.unconverted === 1 ? '' : 's'} excluded — no exchange rate available</div>`
    : '';
  return `
    <div class="nw">
      <div class="nw-row"><span>Assets</span><span>${esc(fmt(nw.totalAssets))} ${esc(nw.homeCurrency)}</span></div>
      <div class="nw-row"><span>Liabilities</span><span>${esc(fmt(nw.totalLiabilities))} ${esc(nw.homeCurrency)}</span></div>
      <div class="nw-row total"><span>Net worth</span><span style="color:${sign}">${esc(fmt(nw.netWorth))} ${esc(nw.homeCurrency)}</span></div>
      ${note}
    </div>`;
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${THEME.bg}; font-family: 'DejaVu Sans', 'Liberation Sans', 'Noto Emoji', sans-serif; }
  #report { width: 900px; background: ${THEME.bg}; color: ${THEME.text}; padding: 32px; }

  .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 22px; }
  .head h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.4px; }
  .head .sub { color: ${THEME.muted}; font-size: 14px; margin-top: 6px; }
  .head .cur { color: ${THEME.muted}; font-size: 13px; border: 1px solid ${THEME.border};
               border-radius: 999px; padding: 5px 12px; }

  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
  .tile { background: ${THEME.card}; border: 1px solid ${THEME.border}; border-radius: 16px; padding: 16px 18px; }
  .tile-label { color: ${THEME.muted}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; }
  /* Values must stay on one line — a wrapped amount reads as two figures. */
  .tile-value { font-size: 24px; font-weight: 700; margin-top: 8px; letter-spacing: -0.5px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile-unit { font-size: 13px; font-weight: 600; color: ${THEME.muted}; margin-left: 4px; }
  .tile-meta { color: ${THEME.muted}; font-size: 12px; margin-top: 5px; min-height: 15px; }

  .card { background: ${THEME.card}; border: 1px solid ${THEME.border}; border-radius: 20px;
          padding: 20px 22px; margin-bottom: 16px; }
  .card h2 { font-size: 15px; font-weight: 600; letter-spacing: 0.2px; }
  .card .hint { color: ${THEME.muted}; font-size: 12px; margin-top: 3px; }
  .card-head { margin-bottom: 16px; }

  .bars { display: flex; flex-direction: column; gap: 11px; }
  .bars.tight { gap: 9px; margin-top: 14px; }
  .bar-row { display: grid; grid-template-columns: 168px 1fr 168px; align-items: center; gap: 14px; }
  .bar-row.sm { grid-template-columns: 120px 1fr 46px; gap: 10px; }
  .bar-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .bar-name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .bar-track { background: ${THEME.cardAlt}; border-radius: 999px; height: 10px; overflow: hidden; }
  .bar-track.lg { height: 13px; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-value { font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
  .bar-value .unit { color: ${THEME.muted}; font-size: 11px; }
  .bar-pct { color: ${THEME.muted}; font-size: 12px; margin-left: 7px; }

  .trend { width: 100%; height: 210px; display: block; }
  .svg-axis { fill: ${THEME.muted}; font-size: 11px; font-family: 'DejaVu Sans', sans-serif; }
  .trend-foot { color: ${THEME.muted}; font-size: 12px; text-align: right; margin-top: 4px; }

  .split { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; }
  .split .card { margin-bottom: 0; }

  .cap-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
  .cap-nums { font-variant-numeric: tabular-nums; }
  .cap-meta { font-size: 12px; margin-top: 8px; font-weight: 600; }
  .cap-sub { color: ${THEME.muted}; font-size: 11px; margin-top: 3px; }

  .nw { display: flex; flex-direction: column; gap: 11px; }
  .nw-row { display: flex; justify-content: space-between; font-size: 13px; font-variant-numeric: tabular-nums; }
  .nw-row span:first-child { color: ${THEME.muted}; }
  .nw-row.total { border-top: 1px solid ${THEME.border}; padding-top: 11px; font-size: 16px; font-weight: 700; }
  .nw-row.total span:first-child { color: ${THEME.text}; }
  .nw-note { color: ${THEME.muted}; font-size: 11px; margin-top: 2px; }

  .empty { color: ${THEME.muted}; font-size: 13px; padding: 22px 0; text-align: center; }
  .empty.sm { padding: 10px 0; text-align: left; }

  .foot { color: ${THEME.muted}; font-size: 11px; text-align: center; margin-top: 18px; }
`;

/**
 * @param {object} data the shape produced by reportService.buildReportData
 * @returns {string} a complete standalone HTML document
 */
function renderReportHtml(data) {
  const { period, currency, kpis, categories, trend, budgets, netWorth, generatedAt } = data;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ExpenseBeam Report</title><style>${CSS}</style></head>
<body>
  <div id="report">
    <div class="head">
      <div>
        <h1>Spending Report</h1>
        <div class="sub">${esc(period.label)} &middot; ${esc(period.start)} &ndash; ${esc(period.end)}</div>
      </div>
      <div class="cur">${esc(currency)}</div>
    </div>

    <div class="tiles">${renderKpis(kpis)}</div>

    <div class="card">
      <div class="card-head"><h2>Spending Trend</h2></div>
      ${renderTrend(trend, currency)}
    </div>

    <div class="card">
      <div class="card-head">
        <h2>By Category</h2>
        ${categories.hiddenCount ? `<div class="hint">Top ${categories.rows.length - 1} shown, ${categories.hiddenCount} more grouped as Other</div>` : ''}
      </div>
      ${renderCategories(categories, currency)}
    </div>

    <div class="split">
      <div class="card">
        <div class="card-head">
          <h2>Budgets &mdash; ${esc(budgets.monthLabel)} to date</h2>
          ${budgets.note ? `<div class="hint">${esc(budgets.note)}</div>` : ''}
        </div>
        ${renderBudgets(budgets, currency)}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Net Worth</h2>
          <div class="hint">as of today</div>
        </div>
        ${renderNetWorth(netWorth)}
      </div>
    </div>

    <div class="foot">ExpenseBeam &middot; generated ${esc(generatedAt)}</div>
  </div>
</body></html>`;
}

module.exports = { renderReportHtml };
