/* أدوات رسم مخطط PDF — منسوخة من GEO إسلام (geomolg/pdf.js) لنفس الشكل والختم */
"use strict";
const PAL_OUTLINE = [[35.459,31.491],[35.459,31.423],[35.397,31.258],[35.444,31.133],[35.437,31.104],[35.39,31.025],[35.387,30.964],[35.322,30.89],[35.318,30.822],[35.279,30.78],[35.142,30.43],[35.163,30.361],[35.124,30.245],[35.145,30.123],[35.073,29.995],[34.991,29.652],[34.911,29.49],[34.886,29.49],[34.854,29.546],[34.825,29.741],[34.742,29.941],[34.735,30.013],[34.598,30.344],[34.526,30.41],[34.537,30.483],[34.505,30.53],[34.479,30.652],[34.199,31.314],[34.35,31.438],[34.479,31.579],[34.713,31.952],[34.839,32.281],[34.944,32.725],[34.947,32.815],[34.969,32.842],[35.019,32.825],[35.063,32.859],[35.099,33.088],[35.282,33.102],[35.347,33.056],[35.48,33.088],[35.549,33.281],[35.603,33.24],[35.61,33.271],[35.768,33.343],[35.822,33.407],[35.811,33.36],[35.765,33.335],[35.801,33.313],[35.768,33.272],[35.804,33.249],[35.808,33.201],[35.829,33.19],[35.811,33.112],[35.847,33.098],[35.858,32.99],[35.887,32.945],[35.837,32.865],[35.833,32.828],[35.757,32.744],[35.559,32.641],[35.581,32.56],[35.559,32.553],[35.567,32.526],[35.552,32.519],[35.581,32.492],[35.545,32.409],[35.567,32.367],[35.552,32.367],[35.574,32.252],[35.559,32.237],[35.574,32.237],[35.534,32.111],[35.545,32.087],[35.523,32.058],[35.545,31.945],[35.523,31.92],[35.559,31.766],[35.48,31.641],[35.459,31.493]];
const PX = 8;                          // canvas pixels per mm (≈203 dpi)
const mm = v => v * PX;
const GREEN = "#0f5a37", GREEN_D = "#0c3b26", GOLD = "#c99a2e", GOLD_L = "#e6c35f", INK = "#1d2a22", RED = "#d11b1b";
const NICE_SCALES = [200, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 50000];
const AF = '"IBM Plex Sans Arabic", Tahoma, sans-serif', TF = '"Reem Kufi", "IBM Plex Sans Arabic", Tahoma, sans-serif', MF = '"IBM Plex Mono", monospace';

async function loadImg(url) {
  const r = await fetch(url); if (!r.ok) throw new Error("img " + r.status);
  const b = await r.blob(); if (!/^image\//.test(b.type)) throw new Error("not image");
  const u = URL.createObjectURL(b);
  return await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = u; });
}
function fitTxt(ctx, s, x, y, maxW, size, weight, fam, color, align) {
  let fs = size; ctx.font = `${weight} ${fs}px ${fam}`;
  while (ctx.measureText(s).width > maxW && fs > size * .55) { fs *= .93; ctx.font = `${weight} ${fs}px ${fam}`; }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.direction = "rtl"; ctx.fillText(s, x, y);
}
/* how the parcel is split between Oslo areas and master-plan land uses (exact polygon intersection) */
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function txt(ctx, s, x, y, font, color, align = "right", base = "middle") { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.direction = "rtl"; ctx.fillText(s, x, y); }
function halo(ctx, s, x, y, font, color, haloC = "#fff", w = 6, align = "center") { ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.direction = "rtl"; ctx.lineJoin = "round"; ctx.strokeStyle = haloC; ctx.lineWidth = w; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y); }

/* text bent along a circle (keeps Arabic letters joined: the line is drawn flat, then laid on the arc column by column) */
function arcText(ctx, s, cx, cy, r, top, font, color) {
  const t = document.createElement("canvas"), c = t.getContext("2d");
  c.font = font; const w = Math.ceil(c.measureText(s).width) + 8, h = Math.ceil(parseFloat(font.match(/(\d+(?:\.\d+)?)px/)[1]) * 1.5);
  t.width = w; t.height = h; c.font = font; c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "middle"; c.direction = "rtl"; c.fillText(s, w / 2, h / 2);
  const span = w / r;
  for (let x = 0; x < w; x++) {
    const th = top ? -Math.PI / 2 - span / 2 + (x + .5) / r : Math.PI / 2 + span / 2 - (x + .5) / r;
    ctx.save(); ctx.translate(cx + r * Math.cos(th), cy + r * Math.sin(th)); ctx.rotate(top ? th + Math.PI / 2 : th - Math.PI / 2);
    ctx.drawImage(t, x, 0, 1, h, -0.6, -h / 2, 1.6, h); ctx.restore();
  }
}
function palPath(ctx, cx, cy, size) {
  const k = Math.cos(31.5 * Math.PI / 180), pts = PAL_OUTLINE.map(p => [p[0] * k, -p[1]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sc = size / Math.max(x1 - x0, y1 - y0), ox = cx - (x0 + x1) / 2 * sc, oy = cy - (y0 + y1) / 2 * sc;
  ctx.beginPath(); pts.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](ox + p[0] * sc, oy + p[1] * sc)); ctx.closePath();
}
function drawStamp(ctx, cx, cy, R) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-7 * Math.PI / 180); ctx.translate(-cx, -cy);
  ctx.globalAlpha = .93;
  ctx.fillStyle = "rgba(255,252,240,.85)"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = GREEN; ctx.lineWidth = R * .07; ctx.beginPath(); ctx.arc(cx, cy, R * .955, 0, 7); ctx.stroke();
  ctx.strokeStyle = GOLD; ctx.lineWidth = R * .025; ctx.beginPath(); ctx.arc(cx, cy, R * .86, 0, 7); ctx.stroke();
  ctx.strokeStyle = GREEN; ctx.lineWidth = R * .02; ctx.beginPath(); ctx.arc(cx, cy, R * .6, 0, 7); ctx.stroke();
  const ringR = R * .73, fs = Math.round(R * .15);
  // النص العلوي على محيط الختم، والخط يصغر تلقائياً ليتسع بين النجمتين
  const topT = "المهندس والمصمم إسلام إسماعيل دويكات"; ctx.font = `700 ${fs}px ${AF}`;
  const maxW = ringR * Math.PI * 0.84, w0 = ctx.measureText(topT).width, fsT = w0 > maxW ? Math.floor(fs * maxW / w0) : fs;
  arcText(ctx, topT, cx, cy, ringR, true, `700 ${fsT}px ${AF}`, GREEN_D);
  arcText(ctx, "هاتف 0598161862", cx, cy, ringR, false, `700 ${fs}px ${AF}`, GREEN_D);
  // separators
  [0, Math.PI].forEach(a => { ctx.fillStyle = GOLD; const x = cx + ringR * Math.cos(a), y = cy + ringR * Math.sin(a); ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr2 = i % 2 ? R * .03 : R * .075, t = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(x + rr2 * Math.cos(t), y + rr2 * Math.sin(t)); } ctx.closePath(); ctx.fill(); });
  // Palestine map in green
  palPath(ctx, cx, cy, R * .98); const g = ctx.createLinearGradient(cx, cy - R * .5, cx, cy + R * .5); g.addColorStop(0, "#1f8a57"); g.addColorStop(1, "#0f5a37");
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = "#e6c35f"; ctx.lineWidth = R * .018; ctx.stroke();
  ctx.restore();
}
function northArrow(ctx, x, y, s) {
  ctx.save(); ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(x, y, s * .75, 0, 7); ctx.fill(); ctx.strokeStyle = GREEN; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - s * .6); ctx.lineTo(x + s * .25, y + s * .35); ctx.lineTo(x, y + s * .18); ctx.closePath(); ctx.fillStyle = GREEN; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y - s * .6); ctx.lineTo(x - s * .25, y + s * .35); ctx.lineTo(x, y + s * .18); ctx.closePath(); ctx.fillStyle = GOLD_L; ctx.fill(); ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.stroke();
  txt(ctx, "N", x, y - s * 1.0, `700 ${Math.round(s * .4)}px ${MF}`, GREEN, "center"); ctx.restore();
}
function frameHeader(ctx, W, title, sub, tag = "مخطط استرشادي") {
  ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, W, mm(297));
  ctx.strokeStyle = GREEN; ctx.lineWidth = mm(.9); ctx.strokeRect(mm(5), mm(5), W - mm(10), mm(287));
  ctx.strokeStyle = GOLD; ctx.lineWidth = mm(.35); ctx.strokeRect(mm(6.6), mm(6.6), W - mm(13.2), mm(283.8));
  const g = ctx.createLinearGradient(0, mm(9), 0, mm(31)); g.addColorStop(0, "#17613f"); g.addColorStop(1, GREEN_D);
  rr(ctx, mm(9), mm(9), W - mm(18), mm(22), mm(3)); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = GOLD; ctx.fillRect(mm(9), mm(30.2), W - mm(18), mm(.8));
  txt(ctx, title, W - mm(14), mm(16.5), `700 ${mm(7)}px ${TF}`, "#f3dc93");
  txt(ctx, sub, W - mm(14), mm(25), `600 ${mm(4.1)}px ${AF}`, "#fff6d6");
  txt(ctx, "المهندس إسلام", mm(14), mm(16.5), `700 ${mm(5)}px ${TF}`, "#f3dc93", "left");
  if (tag) txt(ctx, tag, mm(14), mm(25), `500 ${mm(3.4)}px ${AF}`, "#e7efe1", "left");
}
function drawGrid(ctx, F, G, itm) {
  const { gx0, gx1, gy0, gy1, X, Y, gw } = G;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000], step = steps.reduce((a, b) => Math.abs(b - gw / 5) < Math.abs(a - gw / 5) ? b : a);
  const to = G.to || ((x, y) => itm ? proj4("EPSG:28191", "EPSG:2039", [x, y]) : [x, y]);
  const from = G.from || ((x, y) => itm ? proj4("EPSG:2039", "EPSG:28191", [x, y]) : [x, y]);
  const cross = (a, b, k) => { const out = [], N = 300; let pv = null, pp = null;
    for (let i = 0; i <= N; i++) { const t = i / N, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, v = to(x, y)[k];
      if (pv !== null) { const m0 = Math.floor(pv / step), m1 = Math.floor(v / step); if (m0 !== m1) { const val = Math.max(m0, m1) * step, f = (val - pv) / (v - pv); out.push({ x: pp[0] + (x - pp[0]) * f, y: pp[1] + (y - pp[1]) * f, val }); } }
      pv = v; pp = [x, y]; } return out; };
  const fs = mm(2.6), font = `700 ${fs}px ${MF}`, tick = mm(2.2), gap = mm(1.2);
  ctx.save();
  const lab = (s, x, y, rot) => { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = "ltr"; ctx.fillStyle = GREEN_D; ctx.fillText(s, 0, 0); ctx.restore(); };
  const out = (x1, y1, x2, y2) => { ctx.strokeStyle = GREEN_D; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const bright = (x1, y1, x2, y2) => { if (G.light) { ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,.38)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return; } ctx.lineCap = "round"; ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.strokeStyle = "rgba(255,244,190,.92)"; ctx.lineWidth = 2.6; ctx.stroke(); };
  const sys = itm ? "ITM" : "PG";
  cross([gx0, gy1], [gx1, gy1], 0).forEach(c => { const px = X(c.x); out(px, F.y, px, F.y - tick); bright(px, F.y, px, F.y + tick); lab(String(c.val), px, F.y - tick - gap - fs * .5); });
  cross([gx0, gy0], [gx1, gy0], 0).forEach(c => { const px = X(c.x); out(px, F.y + F.h, px, F.y + F.h + tick); bright(px, F.y + F.h, px, F.y + F.h - tick); lab(String(c.val), px, F.y + F.h + tick + gap + fs * .5); });
  cross([gx0, gy0], [gx0, gy1], 1).forEach(c => { const py = Y(c.y); out(F.x, py, F.x - tick, py); bright(F.x, py, F.x + tick, py); lab(String(c.val), F.x - tick - gap - fs * .5, py, -Math.PI / 2); });
  cross([gx1, gy0], [gx1, gy1], 1).forEach(c => { const py = Y(c.y); out(F.x + F.w, py, F.x + F.w + tick, py); bright(F.x + F.w, py, F.x + F.w - tick, py); lab(String(c.val), F.x + F.w + tick + gap + fs * .5, py, -Math.PI / 2); });
  // crosses at the grid intersections
  const c0 = to(gx0, gy0), c1 = to(gx1, gy1), c2 = to(gx0, gy1), c3 = to(gx1, gy0);
  const ax0 = Math.min(c0[0], c1[0], c2[0], c3[0]), ax1 = Math.max(c0[0], c1[0], c2[0], c3[0]), ay0 = Math.min(c0[1], c1[1], c2[1], c3[1]), ay1 = Math.max(c0[1], c1[1], c2[1], c3[1]);
  for (let gx = Math.ceil(ax0 / step) * step; gx <= ax1; gx += step) for (let gy = Math.ceil(ay0 / step) * step; gy <= ay1; gy += step) {
    const p = from(gx, gy), px = X(p[0]), py = Y(p[1]); if (px < F.x + mm(5) || px > F.x + F.w - mm(5) || py < F.y + mm(5) || py > F.y + F.h - mm(5)) continue;
    const r = mm(2.4); bright(px - r, py, px + r, py); bright(px, py - r, px, py + r);
  }
  ctx.restore();
}
