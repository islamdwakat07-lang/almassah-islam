/* تصدير مخطط القطعة PDF — المساح إسلام */
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
async function rqP(url, params) {
  const r = await fetch(url, { method: "POST", body: new URLSearchParams(Object.assign({ f: "json" }, params)) });
  const j = await r.json(); if (j.error) throw new Error(j.error.message || "server"); return j;
}
const toMP = rings => rings.length === 1 ? [[rings[0]]] : polygonClipping.xor(...rings.map(r => [[r]]));
const mpArea = mp => mp.reduce((s, pg) => s + Math.abs(ringArea(pg[0])) - pg.slice(1).reduce((t, h) => t + Math.abs(ringArea(h)), 0), 0);
async function analyzeParcel(geom) {
  const g = JSON.stringify({ rings: geom.rings, spatialReference: { wkid: 28191 } });
  const q = { geometry: g, geometryType: "esriGeometryPolygon", inSR: 28191, spatialRel: "esriSpatialRelIntersects", returnGeometry: "true", outSR: 28191 };
  const pm = toMP(geom.rings), total = mpArea(pm);
  const inter = f => { try { return mpArea(polygonClipping.intersection(pm, toMP(f.geometry.rings))); } catch (e) { return 0; } };
  const [abc, ump] = await Promise.all([
    rqP(REST + "ABC_Areas_JurisdictionBorders_07/MapServer/0/query", Object.assign({ outFields: "LandClassificationValue_Arabic", maxAllowableOffset: 0.3 }, q)).catch(() => null),
    rqP(REST + "UrbanMasterPlans_Approved_03/MapServer/4/query", Object.assign({ outFields: "*", maxAllowableOffset: 0.05 }, q)).catch(() => null)]);
  if (!abc && !ump) throw new Error("no data");
  const res = { total, abc: {}, ump: {}, regs: {} };
  if (abc) abc.features.forEach(f => { const k = (f.attributes.LandClassificationValue_Arabic || "").trim() || "غير مصنفة"; res.abc[k] = (res.abc[k] || 0) + inter(f); });
  if (ump) ump.features.forEach(f => { const a = f.attributes, lu = (a["A1_1_UMPs_Approved_03.LandUse_Arabic"] || a.LandUse_Arabic || "").trim() || "غير محدد", ar = inter(f); if (ar < .01) return; res.ump[lu] = (res.ump[lu] || 0) + ar; if (!res.regs[lu]) res.regs[lu] = a; });
  return res;
}
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
  arcText(ctx, "المصمم إسلام إسماعيل دويكات", cx, cy, ringR, true, `700 ${fs}px ${AF}`, GREEN_D);
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
function frameHeader(ctx, W, title, sub) {
  ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, W, mm(297));
  ctx.strokeStyle = GREEN; ctx.lineWidth = mm(.9); ctx.strokeRect(mm(5), mm(5), W - mm(10), mm(287));
  ctx.strokeStyle = GOLD; ctx.lineWidth = mm(.35); ctx.strokeRect(mm(6.6), mm(6.6), W - mm(13.2), mm(283.8));
  const g = ctx.createLinearGradient(0, mm(9), 0, mm(31)); g.addColorStop(0, "#17613f"); g.addColorStop(1, GREEN_D);
  rr(ctx, mm(9), mm(9), W - mm(18), mm(22), mm(3)); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = GOLD; ctx.fillRect(mm(9), mm(30.2), W - mm(18), mm(.8));
  txt(ctx, title, W - mm(14), mm(16.5), `700 ${mm(7)}px ${TF}`, "#f3dc93");
  txt(ctx, sub, W - mm(14), mm(25), `600 ${mm(4.1)}px ${AF}`, "#fff6d6");
  txt(ctx, "المساح إسلام", mm(14), mm(16.5), `700 ${mm(5)}px ${TF}`, "#f3dc93", "left");
  txt(ctx, "مخطط استرشادي", mm(14), mm(25), `500 ${mm(3.4)}px ${AF}`, "#e7efe1", "left");
}
function footer(ctx, W, page, pages) {
  const d = new Date(), ds = d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  txt(ctx, "المعلومات مأخوذة من جيومولج (وزارة الحكم المحلي) وسلطة الأراضي للاستئناس، وليست مخططاً مساحياً رسمياً.", W - mm(10), mm(287), `500 ${mm(2.9)}px ${AF}`, "#5d6458");
  txt(ctx, `تاريخ الإصدار ${ds}  ·  صفحة ${page} من ${pages}`, mm(10), mm(287), `500 ${mm(2.9)}px ${AF}`, "#5d6458", "left");
}

async function exportPDF(opts) {
  opts = opts || {};
  if (!curParcel || !curParcel.geom) return;
  const btn = $("#oGo"), old = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "…جاري تجهيز المخطط"; }
  try {
    await Promise.all([`700 20px ${AF}`, `600 20px ${AF}`, `500 20px ${AF}`, `700 20px ${TF}`, `500 20px ${MF}`].map(f => document.fonts.load(f).catch(() => 0)));
    const P = curParcel, A = P.attrs || {}, q = P.q || {};
    const rings = P.geom.rings, all = rings.flat();
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    let bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const W = mm(210), H = mm(297);
    const vil = q.vil || A.VILLAGE_A || A["البلدة"] || A.CommunityName_Arabic || "", gov = q.gov || A.GOV_A || A.GovernorateName_Arabic || "";
    const bn = q.bn != null ? q.bn : (A.BLOCK_NO != null ? A.BLOCK_NO : A.BlockNumber), plot = q.plot || A.Plot_NO || A.ParcelNumber || "";
    const bname = (A.BLOCK_A || A.BlockName_Arabic || "").trim(), sb = +(q.sb || A.SUB_BLOCK_NO || 0) || 0;
    const cr = rings.map(corners);
    const area = rings.reduce((t, r) => t + Math.abs(ringArea(r)), 0), per = cr.reduce((t, p) => t + p.reduce((u, a, i) => { const b = p[(i + 1) % p.length]; return u + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0), 0);
    const cxg = (bx0 + bx1) / 2, cyg = (by0 + by1) / 2, itm = proj4("EPSG:28191", "EPSG:2039", [cxg, cyg]);
    const srcArea = A.Shape_Area || A.SHAPE_Area;
    const base = BASES.find(b => b.id === st.base && b.svc) || BASES.find(b => b.id === "2022");
    if (btn) btn.textContent = "…جاري تحليل القطعة";
    let an = null; try { an = await analyzeParcel(P.geom); } catch (e) { an = null; }
    if (btn) btn.textContent = "…جاري تجهيز المخطط";

    // table rows
    const ISO = s => "\u2066" + s + "\u2069", fA = v => Math.round(v).toLocaleString("en-US") + " م²", pc = v => ISO((v * 100).toFixed(1) + "%");
    const rows = [
      ["المحافظة", gov], ["البلدة", vil], ["الحوض", bn + (bname && bname !== String(bn) ? " – " + bname : "")], ...(sb ? [["الحي", sb]] : []), ["رقم القطعة", plot],
      ["المساحة حسب المصدر", srcArea ? fA(srcArea) : "—"],
      ["المساحة من الحدود", area.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " م²   ·   المحيط " + per.toFixed(1) + " م"],
      ["المركز – فلسطين", `X ${cxg.toFixed(2)}   Y ${cyg.toFixed(2)}`], ["المركز – ITM", `X ${itm[0].toFixed(2)}   Y ${itm[1].toFixed(2)}`],
      ["مصدر الحدود", (P.src || "جيومولج")], ["الصورة الجوية", (base && base.name) || "—"],
      ...(opts.grid ? [["شبكة الإحداثيات", opts.sys === "itm" ? "إسرائيلية ITM (Israel TM Grid)" : "فلسطينية (Palestine 1923 Grid)"]] : [])
    ];
    rows.push(["__h", "تحليل القطعة"]);
    if (!an) rows.push(["التحليل", "تعذّر جلب طبقات التحليل – تحقق من الإنترنت"]);
    else {
      const T = an.total || area;
      const abc = Object.entries(an.abc || {}).filter(e => e[1] > .05).sort((a, b) => b[1] - a[1]);
      rows.push(["مناطق أوسلو", abc.length ? abc.map(([k, v]) => `${k} ${pc(v / T)}`).join("  ·  ") + (abc.length > 1 ? "  (يمر خط التقسيم في القطعة)" : "") : "—"]);
      if (abc.length > 1) abc.forEach(([k, v]) => rows.push(["   " + k, fA(v) + "  " + ISO("(" + (v / T * 100).toFixed(1) + "%)")]));
      const ump = Object.entries(an.ump || {}).filter(e => e[1] > .05);
      if (!ump.length) rows.push(["المخطط الهيكلي", "القطعة خارج حدود المخطط الهيكلي المصدق"]);
      else {
        const isRoad = k => /شارع|طريق|درج|رصيف|سكة/.test(k) && !/ملغى|الغاؤه/.test(k);
        const roads = ump.filter(([k]) => isRoad(k)), uses = ump.filter(([k]) => !isRoad(k)).sort((a, b) => b[1] - a[1]);
        const rA = roads.reduce((t, e) => t + e[1], 0), inA = ump.reduce((t, e) => t + e[1], 0);
        uses.slice(0, 6).forEach(([k, v]) => rows.push(["استعمال: " + k, fA(v) + "  " + ISO("(" + (v / T * 100).toFixed(1) + "%)")]));
        rows.push(["اقتطاعات الطرق", rA > .05 ? fA(rA) + "  " + ISO("(" + (rA / T * 100).toFixed(1) + "%)") + (roads.length ? "  –  " + roads.map(e => e[0]).join("، ") : "") : "لا يوجد طرق داخل القطعة"]);
        if (T - inA > T * .01) rows.push(["خارج المخطط الهيكلي", fA(T - inA) + "  " + ISO("(" + ((T - inA) / T * 100).toFixed(1) + "%)")]);
        const main = uses[0] && an.regs[uses[0][0]];
        if (main) {
          const g = k => { const key = Object.keys(main).find(x => x.indexOf(k) >= 0); const v = key ? main[key] : null; return v == null || v === "" || v === 0 ? null : v; };
          const parts = [];
          if (g("عدد_الطوابق")) parts.push("طوابق " + g("عدد_الطوابق"));
          if (g("النسبه_المئويه_السطحية")) parts.push("نسبة بناء " + ISO(String(g("النسبه_المئويه_السطحية")).replace(/%/g, "").trim() + "%"));
          const sb3 = [g("الارتداد_الامامي"), g("الارتداد_الجانبي"), g("الارتداد_الخلفي")];
          if (sb3.some(v => v != null)) parts.push("ارتداد أمامي " + (sb3[0] ?? "-") + " م، جانبي " + (sb3[1] ?? "-") + " م، خلفي " + (sb3[2] ?? "-") + " م");
          if (g("الحد_الادنى_للإفراز")) parts.push("أقل إفراز " + g("الحد_الادنى_للإفراز") + " م²");
          if (parts.length) rows.push(["أحكام " + uses[0][0], parts.join("  ·  ")]);
        }
      }
    }

    // page layout: the table takes what it needs, the picture gets the rest
    let rh = mm(5.1); const tableBottom = mm(281);
    let ty0 = tableBottom - rh * rows.length; if (ty0 < mm(170)) { ty0 = mm(170); rh = (tableBottom - ty0) / rows.length; }
    const fx = opts.grid ? 18 : 10, fy = opts.grid ? 40 : 34, fwmm = opts.grid ? 174 : 190;
    const fhmm = (ty0 / PX) - (opts.grid ? 10 : 5) - fy;
    const F = { x: mm(fx), y: mm(fy), w: mm(fwmm), h: mm(fhmm) };
    const need = Math.max((bx1 - bx0) * 1.5 * 1000 / fwmm, (by1 - by0) * 1.5 * 1000 / fhmm);
    const S = NICE_SCALES.find(v => v >= need) || Math.ceil(need / 1000) * 1000;
    const gw = fwmm * S / 1000, gh = fhmm * S / 1000;
    const gx0 = cxg - gw / 2, gx1 = cxg + gw / 2, gy0 = cyg - gh / 2, gy1 = cyg + gh / 2;
    const X = x => F.x + (x - gx0) / gw * F.w, Y = y => F.y + (gy1 - y) / gh * F.h;
    const iw = Math.round(F.w), ih = Math.round(F.h), bbox = [gx0, gy0, gx1, gy1].join(",");

    // images: aerial photo + the switched-on layers
    const exp = (svc, extra, tk, root) => (root || REST) + svc + "/MapServer/export?bbox=" + bbox + "&bboxSR=28191&imageSR=28191&size=" + iw + "," + ih + "&dpi=200&f=image" + extra + (tk ? "&token=" + tk : "");
    const want = {}; LAYERS.forEach(l => { if (st.on[l.id]) (want[l.svc] = want[l.svc] || { cfg: l, ids: [] }).ids.push(...l.ids); });
    const order = [...new Set(LAYERS.map(l => l.svc))].reverse().filter(s => want[s]);
    const jobs = [loadImg(exp(base.svc, "&format=jpg", base.tk)).catch(() => loadImg(exp("Orthophotos_WB_2022_15cm_tif_PG1923_05", "&format=jpg")).catch(() => null))]
      .concat(order.map(s => loadImg(exp(s, "&format=png32&transparent=true&layers=show:" + want[s].ids.join(","), want[s].cfg.tk, want[s].cfg.base)).catch(() => null)));
    const imgs = await Promise.all(jobs);

    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    frameHeader(ctx, W, "مخطط موقع قطعة أرض", `قطعة ${plot} · حوض ${bn}${bname && bname !== String(bn) ? " (" + bname + ")" : ""}${sb ? " · حي " + sb : ""} · ${vil} · ${gov}`);

    // map
    ctx.save(); rr(ctx, F.x, F.y, F.w, F.h, mm(2)); ctx.clip();
    ctx.fillStyle = "#e9e3cf"; ctx.fillRect(F.x, F.y, F.w, F.h);
    imgs.forEach(im => { if (im) ctx.drawImage(im, F.x, F.y, F.w, F.h); });
    // parcel
    ctx.beginPath(); rings.forEach(r => r.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](X(p[0]), Y(p[1])))); ctx.closePath();
    ctx.fillStyle = "rgba(225,29,29,.10)"; ctx.fill("evenodd"); ctx.strokeStyle = "#fff"; ctx.lineWidth = mm(1.3); ctx.stroke(); ctx.strokeStyle = RED; ctx.lineWidth = mm(.75); ctx.stroke();
    let vno = 0; const vtx = [];
    cr.forEach(p => {
      const sgn = Math.sign(ringArea(p)) || 1;
      p.forEach((a, i) => {
        const b = p[(i + 1) % p.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]); vtx.push({ n: ++vno, x: a[0], y: a[1], d });
        if (d < 0.5 || opts.lens === false) return;
        const mx = (X(a[0]) + X(b[0])) / 2, my = (Y(a[1]) + Y(b[1])) / 2, ux = (X(b[0]) - X(a[0])), uy = (Y(b[1]) - Y(a[1])), L2 = Math.hypot(ux, uy);
        if (L2 < mm(cr.reduce((t, r) => t + r.length, 0) > 30 ? 9 : 4)) return;
        const nx = -uy / L2 * sgn, ny = ux / L2 * sgn;   // outward normal in canvas space
        let ang = Math.atan2(uy, ux); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        ctx.save(); ctx.translate(mx + nx * mm(3.4), my + ny * mm(3.4)); ctx.rotate(ang);
        const s = d.toFixed(2); ctx.font = `700 ${mm(3)}px ${MF}`; const tw = ctx.measureText(s).width + mm(2);
        rr(ctx, -tw / 2, -mm(2.1), tw, mm(4.2), mm(1)); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = RED; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = "ltr"; ctx.fillText(s, 0, mm(.2)); ctx.restore();
      });
    });
    const many = vtx.length > 30;
    vtx.forEach(v => { const x = X(v.x), y = Y(v.y); ctx.beginPath(); ctx.arc(x, y, mm(many ? .8 : 1.9), 0, 7); ctx.fillStyle = RED; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = many ? 1.5 : 3; ctx.stroke();
      if (!many) { ctx.font = `700 ${mm(2.4)}px ${MF}`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = "ltr"; ctx.fillText(String(v.n), x, y + mm(.15)); } });
    ctx.restore();
    ctx.strokeStyle = GREEN; ctx.lineWidth = mm(.6); rr(ctx, F.x, F.y, F.w, F.h, mm(2)); ctx.stroke();
    if (opts.grid) drawGrid(ctx, F, { gx0, gx1, gy0, gy1, X, Y, gw }, opts.sys === "itm");
    northArrow(ctx, F.x + mm(12), F.y + mm(16), mm(9));
    // scale bar
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000], target = gw / 5, Lm = nice.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a), Lp = Lm / gw * F.w;
    const sx = F.x + mm(8), sy = F.y + F.h - mm(9);
    rr(ctx, sx - mm(4), sy - mm(11.5), Math.max(Lp, mm(34)) + mm(8), mm(16.5), mm(1.5)); ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fill();
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#fff" : GREEN; ctx.fillRect(sx + Lp / 4 * i, sy, Lp / 4, mm(1.6)); }
    ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, Lp, mm(1.6));
    txt(ctx, "0", sx, sy - mm(2.6), `600 ${mm(2.6)}px ${MF}`, INK, "center"); txt(ctx, Lm + " م", sx + Lp, sy - mm(2.6), `600 ${mm(2.6)}px ${AF}`, INK, "center");
    txt(ctx, "مقياس الرسم 1:" + S.toLocaleString("en-US"), sx + Math.max(Lp, mm(34)) / 2, sy - mm(8), `700 ${mm(2.8)}px ${AF}`, GREEN, "center");

    // info table
    const tx0 = mm(76), tx1 = mm(200), lw = mm(40), fsz = Math.min(mm(3.1), rh * .6);
    rr(ctx, tx0, ty0, tx1 - tx0, rh * rows.length, mm(2)); ctx.fillStyle = "#fffaf0"; ctx.fill(); ctx.strokeStyle = "#d8c79a"; ctx.lineWidth = 2; ctx.stroke();
    rows.forEach((r, i) => {
      const y = ty0 + rh * i;
      if (r[0] === "__h") { ctx.fillStyle = GREEN_D; ctx.fillRect(tx0 + 1, y + 1, tx1 - tx0 - 2, rh - 2); fitTxt(ctx, r[1], tx1 - mm(2.5), y + rh / 2, tx1 - tx0 - mm(5), fsz, `700`, TF, "#f3dc93", "right"); return; }
      if (i) { ctx.strokeStyle = "#eadfbf"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx0 + mm(1), y); ctx.lineTo(tx1 - mm(1), y); ctx.stroke(); }
      if (i % 2 === 0) { ctx.fillStyle = "rgba(243,234,210,.55)"; ctx.fillRect(tx1 - lw, y + 1, lw - 2, rh - 2); }
      fitTxt(ctx, r[0].trim(), tx1 - mm(2.5) - (r[0].startsWith("   ") ? mm(3) : 0), y + rh / 2, lw - mm(4), fsz, "600", AF, "#5d6458", "right");
      const val = String(r[1]); const isNum = /^X /.test(val);
      fitTxt(ctx, val, isNum ? tx0 + mm(3) : tx1 - lw - mm(3), y + rh / 2, tx1 - tx0 - lw - mm(6), fsz * 1.03, "700", isNum ? MF : AF, INK, isNum ? "left" : "right");
    });
    const stR = Math.min(mm(31), (tableBottom - ty0) / 2 - mm(1), mm(33));
    drawStamp(ctx, mm(41), (ty0 + tableBottom) / 2, Math.max(stR, mm(24)));


    // page 2: corner coordinates
    const pages = [cv];
    const per2 = 34; const chunks = []; if (opts.page) for (let i = 0; i < vtx.length; i += per2) chunks.push(vtx.slice(i, i + per2));
    const total = 1 + chunks.length;
    footer(ctx, W, 1, total);
    chunks.forEach((ch, ci) => {
      const c2 = document.createElement("canvas"); c2.width = W; c2.height = H; const k = c2.getContext("2d");
      frameHeader(k, W, "إحداثيات رؤوس القطعة", `قطعة ${plot} · حوض ${bn} · ${vil} · ${gov}`);
      const cols = [["الرأس", 16], ["X فلسطين", 30], ["Y فلسطين", 30], ["X ITM", 30], ["Y ITM", 30], ["طول الضلع للتالي (م)", 34]];
      const x1 = mm(200), y0 = mm(38), h = mm(6.6); let x = x1;
      k.fillStyle = GREEN_D; rr(k, mm(10), y0, mm(190), h, mm(1.5)); k.fill();
      const colX = []; cols.forEach(([t, w]) => { colX.push([x - mm(w), x]); txt(k, t, x - mm(w) / 2, y0 + h / 2, `700 ${mm(3.2)}px ${AF}`, "#f3dc93", "center"); x -= mm(w); });
      ch.forEach((v, i) => {
        const y = y0 + h * (i + 1); if (i % 2 === 0) { k.fillStyle = "#f6efd9"; k.fillRect(mm(10), y, mm(190), h); }
        const it = proj4("EPSG:28191", "EPSG:2039", [v.x, v.y]);
        [String(v.n), v.x.toFixed(2), v.y.toFixed(2), it[0].toFixed(2), it[1].toFixed(2), v.d.toFixed(2)].forEach((val, j) => txt(k, val, (colX[j][0] + colX[j][1]) / 2, y + h / 2, `600 ${mm(3.2)}px ${MF}`, INK, "center"));
      });
      k.strokeStyle = "#d8c79a"; k.lineWidth = 2; k.strokeRect(mm(10), y0, mm(190), h * (ch.length + 1));
      const ny = y0 + h * (ch.length + 1) + mm(6);
      txt(k, "الإحداثيات بنظام فلسطين (الشبكة القديمة) كما في جيومولج، ومحوّلة إلى ITM للاستئناس. أرقام الرؤوس مطابقة لأرقامها على المخطط.", mm(200), ny, `500 ${mm(3)}px ${AF}`, "#5d6458");
      drawStamp(k, mm(41), mm(250), mm(26));
      footer(k, W, ci + 2, total); pages.push(c2);
    });

    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297); });
    const name = `مخطط قطعة ${plot} حوض ${bn} ${vil}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
    if (window.AndroidBridge && AndroidBridge.saveFile) AndroidBridge.saveFile(name, doc.output("datauristring").split(",")[1], "application/pdf");
    else doc.save(name);
    window.__lastPdfPages = pages;
  } catch (e) { const b = $("#idMore"); if (b) b.insertAdjacentHTML("afterbegin", '<p class="msg">تعذّر تجهيز المخطط: ' + esc(e.message) + '</p>'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}

/* real coordinates around the picture: numbers outside the frame, ticks on it, bright crosses inside */
function drawGrid(ctx, F, G, itm) {
  const { gx0, gx1, gy0, gy1, X, Y, gw } = G;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000], step = steps.reduce((a, b) => Math.abs(b - gw / 5) < Math.abs(a - gw / 5) ? b : a);
  const to = (x, y) => itm ? proj4("EPSG:28191", "EPSG:2039", [x, y]) : [x, y];
  const from = (x, y) => itm ? proj4("EPSG:2039", "EPSG:28191", [x, y]) : [x, y];
  const cross = (a, b, k) => { const out = [], N = 300; let pv = null, pp = null;
    for (let i = 0; i <= N; i++) { const t = i / N, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, v = to(x, y)[k];
      if (pv !== null) { const m0 = Math.floor(pv / step), m1 = Math.floor(v / step); if (m0 !== m1) { const val = Math.max(m0, m1) * step, f = (val - pv) / (v - pv); out.push({ x: pp[0] + (x - pp[0]) * f, y: pp[1] + (y - pp[1]) * f, val }); } }
      pv = v; pp = [x, y]; } return out; };
  const fs = mm(2.6), font = `700 ${fs}px ${MF}`, tick = mm(2.2), gap = mm(1.2);
  ctx.save();
  const lab = (s, x, y, rot) => { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = "ltr"; ctx.fillStyle = GREEN_D; ctx.fillText(s, 0, 0); ctx.restore(); };
  const out = (x1, y1, x2, y2) => { ctx.strokeStyle = GREEN_D; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const bright = (x1, y1, x2, y2) => { ctx.lineCap = "round"; ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.strokeStyle = "rgba(255,244,190,.92)"; ctx.lineWidth = 2.6; ctx.stroke(); };
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
