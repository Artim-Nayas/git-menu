// Shared canvas renderer for promo art (demo GIF frames + social preview).
// Draws the Git Menu popover for a given active tab. Pure: takes a 2D context.
// Used by scripts/build-promo.js — not shipped in the app.

const C = {
  bgTop: '#23242b',
  bgBot: '#191a1f',
  stroke: 'rgba(255,255,255,0.08)',
  segBg: 'rgba(0,0,0,0.28)',
  segActive: 'rgba(255,255,255,0.14)',
  primary: '#ECECEC',
  secondary: '#9B9B9B',
  muted: '#6e7681',
  green: '#2da44e',
  amber: '#d29922',
  red: '#cf222e',
  orange: '#f0883e',
  ring: '#2c2d34',
  rowLine: 'rgba(255,255,255,0.06)',
  orgBg: 'rgba(0,0,0,0.22)',
};

const TABS = ['Mine', 'Reviews', 'Inbox', 'Actions'];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, s, x, y, { size = 13, color = C.secondary, weight = 'normal', align = 'left' } = {}) {
  ctx.font = `${weight} ${size}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function dot(ctx, x, y, color, r = 5) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// Each tab's list area (org header + rows). Returns nothing; draws from y=348.
const LISTS = {
  Mine: (ctx) => {
    orgHeader(ctx, 'getsimplifin/billing-management-service', '5');
    row(ctx, 410, C.green, 'Fix internal charge composite', '#2737', 'fix/internal-charge-composite · ✓ approved · 2d');
    row(ctx, 470, C.amber, 'Add staging release pipeline', '#2736', 'staging-release-02-06 · ● running · 5h');
    row(ctx, 530, C.red, 'Refactor recon batch job', '#2701', 'recon/batch-refactor · ⚠ 2 failing · 1d', true);
  },
  Reviews: (ctx) => {
    orgHeader(ctx, 'getsimplifin/go-core-pkgs', '2');
    row(ctx, 410, C.green, 'Bump core deps to v1.8', '#341', 'chore/dep-bump · ✓ approved · 3h');
    row(ctx, 470, C.amber, 'Wire payout webhook retries', '#128', 'feat/webhook-retries · ● running · 1h', true);
  },
  Inbox: (ctx) => {
    inboxRow(ctx, 392, C.green, 'Review requested', 'billing-management-service #2737 · 2d');
    inboxRow(ctx, 446, C.orange, 'Mentioned you', 'go-core-pkgs #341 · 5h');
    inboxRow(ctx, 500, C.secondary, 'New comment', 'iam-service #88 · 1d', true);
  },
  Actions: (ctx) => {
    orgHeader(ctx, 'Artim-Nayas/git-menu', '3', 366);
    row(ctx, 422, C.green, 'Release', '#11', 'main · push · 2m ago', false, 0);
    row(ctx, 470, C.green, 'CI', '#23', 'main · push · 2m ago', true, 0);
  },
};

function orgHeader(ctx, name, count, y = 348) {
  ctx.fillStyle = C.orgBg;
  ctx.fillRect(8, y, 384, 34);
  text(ctx, name, 20, y + 22, { size: 13, weight: '700', color: C.primary });
  rr(ctx, 356, y + 7, 24, 20, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  text(ctx, count, 368, y + 21, { size: 11, color: C.primary, align: 'center' });
}

function row(ctx, y, color, title, num, meta, last = false, rowGap = 60) {
  dot(ctx, 30, y, color);
  text(ctx, title, 46, y - 4, { size: 14, weight: '600', color: C.primary });
  const tw = ctx.measureText(title).width;
  text(ctx, num, 46 + tw + 8, y - 4, { size: 13, color: C.muted });
  text(ctx, meta, 46, y + 14, { size: 11.5, color: C.secondary });
  text(ctx, '›', 372, y + 2, { size: 13, color: C.muted, align: 'right' });
  if (!last) {
    ctx.strokeStyle = C.rowLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, y + 32);
    ctx.lineTo(380, y + 32);
    ctx.stroke();
  }
}

function inboxRow(ctx, y, color, title, meta, last = false) {
  dot(ctx, 30, y, color, 4);
  text(ctx, title, 46, y - 3, { size: 14, weight: '600', color: C.primary });
  text(ctx, meta, 46, y + 14, { size: 11.5, color: C.secondary });
  if (!last) {
    ctx.strokeStyle = C.rowLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, y + 28);
    ctx.lineTo(380, y + 28);
    ctx.stroke();
  }
}

// Draw the full popover (400x620 logical) for the given active tab.
export function drawPopover(ctx, activeTab) {
  // Card
  const grad = ctx.createLinearGradient(0, 8, 0, 616);
  grad.addColorStop(0, C.bgTop);
  grad.addColorStop(1, C.bgBot);
  rr(ctx, 8, 8, 384, 608, 16);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Segmented control
  rr(ctx, 20, 22, 360, 40, 9);
  ctx.fillStyle = C.segBg;
  ctx.fill();
  const idx = TABS.indexOf(activeTab);
  const segW = 360 / 4;
  rr(ctx, 22 + idx * segW, 24, segW - 4, 36, 7);
  ctx.fillStyle = C.segActive;
  ctx.fill();
  TABS.forEach((t, i) => {
    text(ctx, t, 20 + segW * i + segW / 2, 46, {
      size: 14,
      weight: t === activeTab ? '600' : 'normal',
      color: t === activeTab ? C.primary : C.secondary,
      align: 'center',
    });
  });

  // Contribution ring + stats
  ctx.strokeStyle = C.ring;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(62, 128, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.green;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(62, 128, 28, -Math.PI / 2, Math.PI / 6);
  ctx.stroke();
  ctx.lineCap = 'butt';
  text(ctx, '4', 62, 134, { size: 19, weight: '700', color: C.primary, align: 'center' });
  text(ctx, 'today', 62, 146, { size: 9, color: C.secondary, align: 'center' });
  const stats = [
    ['Current streak', '🔥 4 days', C.orange, '600'],
    ['This week', '123', C.primary, 'normal'],
    ['Best day', '91', C.primary, 'normal'],
    ['This year', '2950', C.primary, 'normal'],
  ];
  stats.forEach(([label, val, vcolor, vweight], i) => {
    const y = 106 + i * 22;
    text(ctx, label, 118, y, { size: 13, color: C.secondary });
    text(ctx, val, 372, y, { size: 13, color: vcolor, weight: vweight, align: 'right' });
  });

  line(ctx, 192);

  // Heatmap row
  text(ctx, '›', 28, 218, { size: 13, color: C.muted });
  text(ctx, 'Heatmap', 44, 218, { size: 13, color: C.secondary });
  rr(ctx, 288, 204, 92, 26, 6);
  ctx.fillStyle = C.segBg;
  ctx.fill();
  text(ctx, 'Last 1 year', 300, 221, { size: 12, color: C.primary });
  text(ctx, '⌄', 368, 220, { size: 10, color: C.secondary });

  line(ctx, 244);

  // Search
  rr(ctx, 20, 258, 360, 38, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  ctx.strokeStyle = C.stroke;
  ctx.stroke();
  text(ctx, 'Search PRs, repos…', 34, 282, { size: 13, color: C.muted });

  // Filter chips — only on the PR-list tabs (Mine / Reviews), matching the app.
  if (activeTab === 'Mine' || activeTab === 'Reviews') {
    chip(ctx, 20, 'All', true, 44);
    chip(ctx, 70, '⚠ Failing', false, 78);
    chip(ctx, 154, '👀 Review', false, 76);
    chip(ctx, 236, '✓ Approved', false, 86);
    chip(ctx, 328, 'Draft', false, 52);
  } else {
    // Inbox/Actions: a hint line where the chips would be.
    text(ctx, activeTab === 'Inbox' ? 'Notifications that need you' : 'Recent workflow runs across your repos',
      20, 326, { size: 12, color: C.muted });
  }

  (LISTS[activeTab] || LISTS.Mine)(ctx);

  // Footer
  line(ctx, 572, 8, 392);
  // gear
  ctx.strokeStyle = C.secondary;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(48, 594, 8, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, 48, 594, C.bgBot, 3);
  ctx.beginPath();
  ctx.arc(48, 594, 2.5, 0, Math.PI * 2);
  ctx.strokeStyle = C.secondary;
  ctx.stroke();
  // refresh
  ctx.beginPath();
  ctx.arc(200, 594, 7, 0.6, Math.PI * 2);
  ctx.stroke();
  // power
  ctx.beginPath();
  ctx.arc(352, 595, 7, -Math.PI / 3, Math.PI * 1.33);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(352, 586);
  ctx.lineTo(352, 595);
  ctx.stroke();
}

function chip(ctx, x, label, active, w) {
  rr(ctx, x, 308, w, 26, 13);
  ctx.fillStyle = active ? C.green : 'rgba(255,255,255,0.06)';
  ctx.fill();
  text(ctx, label, x + w / 2, 325, {
    size: 12,
    color: active ? '#ffffff' : C.secondary,
    weight: active ? '600' : 'normal',
    align: 'center',
  });
}

function line(ctx, y, x1 = 20, x2 = 380) {
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

export { C, TABS };
