/* تحليل القطعة أو النقطة + تقرير PDF بصورة جوية وتهشير القيود — فحص الأرض · المهندس إسلام */
"use strict";
const ANALYZE = LAYERS.filter(l => ["zone", "restrict", "plan", "info", "village", "block"].includes(l.kind));
const ISO = s => "⁦" + s + "⁩";
const fA = v => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)) + " م²";
const pct = v => ISO((v * 100).toFixed(1) + "%");

/* تشغيل عدة استعلامات بالتوازي (بحد أقصى) */
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e }; } } })); return out; }

/* تحليل قطعة (هندسة 3857): كل طبقة تقطعها، والمساحة والنسبة بدقة (بنظام فلسطين المتري) */
async function analyzeParcel(f, onStep) {
  const ringsPG = f.g.rings.map(r => r.map(webToPG)), mp = toMP(ringsPG), total = mpArea(mp);
  const res = { parcel: f, ringsPG, total, groups: [], errors: [] };
  const rs = await pool(ANALYZE, 6, async l => { onStep && onStep(l.n); const m = await meta(l); return { l, m, feats: await query(l, { rings: f.g.rings }) }; });
  for (const r of rs) {
    if (!r || r.error) { res.errors.push(r && r.error ? r.error.message : "?"); continue; }
    const { l, m, feats } = r, items = [];
    for (const ft of feats) {
      if (!ft.g || !ft.g.rings) continue;
      const fr = ft.g.rings.map(rr => rr.map(webToPG));
      let a = 0; try { a = mpArea(polygonClipping.intersection(mp, toMP(fr))); } catch (e) { a = 0; }
      if (a < Math.max(0.05, total * 0.0005)) continue;   // تماس على الحدود فقط
      items.push({ t: title(l, ft.a, m), d: details(l, ft.a, m), area: a, pct: a / total, ringsPG: fr });
    }
    if (l.k === "abc") {   // ما لا تغطيه طبقة أ/ب = منطقة ج
      const cov = items.reduce((s, x) => s + x.area, 0);
      if (total - cov > total * 0.005) items.push({ t: "منطقة C", d: [["ملاحظة", "خارج مناطق A و B حسب طبقة الإدارة المدنية"]], area: total - cov, pct: (total - cov) / total, ringsPG: null });
    }
    // دمج العناصر المتطابقة العنوان (مثلاً عدة مضلعات لنفس الأمر)
    const merged = []; items.forEach(x => { const o = merged.find(y => y.t === x.t); if (o) { o.area += x.area; o.pct += x.pct; o.parts = (o.parts || [o.ringsPG]).concat([x.ringsPG]); } else merged.push(x); });
    if (merged.length) res.groups.push({ l, items: merged.sort((a, b) => b.area - a.area) });
  }
  return res;
}
/* تحليل نقطة (بدون قطعة مسجلة) */
async function analyzePoint(p) {
  const res = { point: p, groups: [], errors: [] };
  const rs = await pool(ANALYZE, 6, async l => { const m = await meta(l); return { l, m, feats: await query(l, { x: p[0], y: p[1] }) }; });
  for (const r of rs) {
    if (!r || r.error) { res.errors.push(r && r.error ? r.error.message : "?"); continue; }
    const items = r.feats.map(ft => ({ t: title(r.l, ft.a, r.m), d: details(r.l, ft.a, r.m), ringsPG: ft.g && ft.g.rings ? ft.g.rings.map(rr => rr.map(webToPG)) : null }));
    if (r.l.k === "abc" && !items.length) items.push({ t: "منطقة C", d: [["ملاحظة", "خارج مناطق A و B حسب طبقة الإدارة المدنية"]] });
    if (items.length) res.groups.push({ l: r.l, items });
  }
  return res;
}
/* ملخص سطري للنتيجة (للشاشة وللتقرير) */
function summaryRows(an) {
  const rows = [], g = k => an.groups.find(x => x.l.k === k);
  const vil = g("village"), blk = g("block"), abc = g("abc");
  if (vil) rows.push(["أراضي قرية", vil.items.map(i => i.t).join("، ")]);
  if (blk) rows.push(["الحوض", blk.items.map(i => i.t.replace(/^حوض /, "")).join("، ")]);
  if (abc) rows.push(["تصنيف أوسلو", abc.items.map(i => i.t + (i.pct != null && abc.items.length > 1 ? " " + pct(i.pct) : "")).join("  ·  ") + (abc.items.length > 1 ? "  (يمر خط التقسيم في القطعة)" : "")]);
  return rows;
}

/* ---------- تقرير PDF ---------- */
const HATCH = {};
function hatchPattern(ctx, color, ang) {
  const key = color + ang; if (HATCH[key]) return HATCH[key];
  const s = mm(3.2), c = document.createElement("canvas"); c.width = c.height = s; const k = c.getContext("2d");
  k.strokeStyle = color; k.lineWidth = mm(.32); k.beginPath(); k.moveTo(0, s / 2); k.lineTo(s, s / 2); k.stroke();
  const p = ctx.createPattern(c, "repeat"); const m = new DOMMatrix().rotate(ang); p.setTransform(m); return (HATCH[key] = p);
}
function footerM(ctx, W, page, pages) {
  const d = new Date(), ds = d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  txt(ctx, "المعلومات من موقع الإدارة المدنية «معلومات للجمهور» والصورة الجوية من جيومولج، للاستئناس فقط وليست مخططاً مساحياً رسمياً.", W - mm(10), mm(287), `500 ${mm(2.7)}px ${AF}`, "#5d6458");
  txt(ctx, `تاريخ الإصدار ${ds}  ·  صفحة ${page} من ${pages}`, mm(10), mm(287), `500 ${mm(2.7)}px ${AF}`, "#5d6458", "left");
}
async function aerial(bbox, iw, ih) {
  const REST = "https://orthophotos.geomolg.ps/adaptor/rest/services/";
  let tk = ""; try { tk = window.geoToken ? await geoToken() : ""; } catch (e) {}
  const exp = (svc, tok) => REST + svc + "/MapServer/export?bbox=" + bbox.join(",") + "&bboxSR=28191&imageSR=28191&size=" + iw + "," + ih + "&dpi=200&format=jpg&f=image" + (tok ? "&token=" + tok : "");
  const tries = [["Orthophotos_WB_2025_15cm_tif_PG1923", tk, "صورة جيومولج 2025 (15 سم)"], ["Orthophotos_WB_2024_15cm_tif_PG1923", tk, "صورة جيومولج 2024 (15 سم)"], ["Orthophotos_WB_2022_15cm_tif_PG1923_05", "", "صورة جيومولج 2022 (15 سم)"]];
  for (const [s, t, n] of tries) { if (t === undefined) continue; try { return { im: await loadImg(exp(s, t)), name: n }; } catch (e) {} }
  try {   // احتياط: صورة Esri العالمية
    const u = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=" + bbox.join(",") + "&bboxSR=28191&imageSR=28191&size=" + iw + "," + ih + "&format=jpg&f=image";
    return { im: await loadImg(u), name: "صورة Esri World Imagery" };
  } catch (e) { return { im: null, name: "تعذّر تحميل الصورة الجوية" }; }
}

async function exportReport(an, opts, onStep) {
  opts = opts || {};
  await Promise.all([`700 20px ${AF}`, `600 20px ${AF}`, `500 20px ${AF}`, `700 20px ${TF}`, `500 20px ${MF}`].map(f => document.fonts.load(f).catch(() => 0)));
  const W = mm(210), H = mm(297), isP = !!an.parcel, a0 = isP ? an.parcel.a : {};
  // حدود الإطار (نظام فلسطين)
  let cx, cy, ext;
  if (isP) { const all = an.ringsPG.flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]); const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; cx = (b[0] + b[2]) / 2; cy = (b[1] + b[3]) / 2; ext = [b[2] - b[0], b[3] - b[1]]; }
  else { const p = webToPG(an.point); cx = p[0]; cy = p[1]; ext = [60, 60]; }
  // جدول المعلومات
  const rows = [], vil = an.groups.find(g => g.l.k === "village");
  const place = (vil ? vil.items[0].t : "") ;
  const itm = conv("pg", "itm", [cx, cy]);
  if (isP) {
    rows.push(["رقم الحوض / القطعة", `حوض ${a0.GUSH_NO ?? "—"}   ·   قطعة ${a0.PARCEL ?? "—"}` + (a0.PARCELATZIA ? `   ·   إفراز ${a0.PARCELATZIA}` : "") + (a0.M_M_NUMBER ? `   ·   م.م ${a0.M_M_NUMBER}` : "")]);
    rows.push(["المساحة من الحدود", an.total.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " م²  ·  " + (an.total / 1000).toFixed(3) + " دونم"]);
  }
  summaryRows(an).forEach(r => rows.push(r));
  rows.push(["المركز – فلسطين", `X ${cx.toFixed(2)}   Y ${cy.toFixed(2)}`]);
  rows.push(["المركز – ITM", `X ${itm[0].toFixed(2)}   Y ${itm[1].toFixed(2)}`]);
  const restr = an.groups.filter(g => !["village", "block", "abc"].includes(g.l.k));
  rows.push(["__h", restr.length ? "القيود والمخططات الواقعة على " + (isP ? "القطعة" : "الموقع") : "لا توجد قيود أو مخططات من طبقات الإدارة المدنية على " + (isP ? "القطعة" : "الموقع")]);
  restr.forEach(g => g.items.forEach(it => {
    rows.push(["◼" + g.l.k + "|" + g.l.n, it.t + (it.area != null ? "   ·   " + fA(it.area) + "  " + ISO("(" + (it.pct * 100).toFixed(1) + "%)") : "")]);
    it.d.filter(d => !it.t.includes(String(d[1]))).slice(0, 4).forEach(d => rows.push(["   " + d[0], String(d[1])]));
  }));
  if (an.errors.length) rows.push(["ملاحظة", `تعذّر فحص ${an.errors.length} طبقة (تحقق من الإنترنت)`]);

  // تقسيم الصفحات: الأولى صورة + أول الجدول، والباقي صفحات جدول
  const rh = mm(5.4), minTop = mm(176), bottom = mm(281);
  const firstCap = Math.floor((bottom - minTop) / rh);
  const need1 = Math.min(rows.length, firstCap), ty0 = Math.max(minTop, bottom - need1 * rh - (rows.length > firstCap ? 0 : 0));
  const pageRows = [rows.slice(0, need1)]; for (let i = need1, cap = Math.floor((bottom - mm(40)) / rh); i < rows.length; i += cap) pageRows.push(rows.slice(i, i + cap));
  const fx = 18, fy = 40, fwmm = 174, fhmm = ty0 / PX - 10 - fy;
  const F = { x: mm(fx), y: mm(fy), w: mm(fwmm), h: mm(fhmm) };
  const needS = Math.max(ext[0] * 1.6 * 1000 / fwmm, ext[1] * 1.6 * 1000 / fhmm, 500);
  const S = NICE_SCALES.find(v => v >= needS) || Math.ceil(needS / 1000) * 1000;
  const gw = fwmm * S / 1000, gh = fhmm * S / 1000, gx0 = cx - gw / 2, gx1 = cx + gw / 2, gy0 = cy - gh / 2, gy1 = cy + gh / 2;
  const X = x => F.x + (x - gx0) / gw * F.w, Y = y => F.y + (gy1 - y) / gh * F.h;

  onStep && onStep("الصورة الجوية");
  const env = [pgToWeb([gx0, gy0]), pgToWeb([gx1, gy1])], envW = [Math.min(env[0][0], env[1][0]), Math.min(env[0][1], env[1][1]), Math.max(env[0][0], env[1][0]), Math.max(env[0][1], env[1][1])];
  const drawK = LAYERS.filter(l => ["restrict", "plan", "zone"].includes(l.kind));
  const [img, frameFeats, neigh] = await Promise.all([
    aerial([gx0, gy0, gx1, gy1], Math.round(F.w), Math.round(F.h)),
    pool(drawK, 6, async l => ({ l, feats: await query(l, { env: envW }) })),
    query(LBY.parcel, { env: envW }).catch(() => [])
  ]);
  onStep && onStep("رسم المخطط");

  const pages = [];
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d"); pages.push(cv);
  frameHeader(ctx, W, isP ? "تقرير فحص قطعة أرض" : "تقرير فحص موقع", (isP ? `حوض ${a0.GUSH_NO ?? "—"} · قطعة ${a0.PARCEL ?? "—"}` : `X ${cx.toFixed(1)} · Y ${cy.toFixed(1)} (فلسطين)`) + (place ? " · أراضي " + place : ""), "تقرير استرشادي");
  ctx.save(); rr(ctx, F.x, F.y, F.w, F.h, mm(2)); ctx.clip();
  ctx.fillStyle = "#e9e3cf"; ctx.fillRect(F.x, F.y, F.w, F.h);
  if (img.im) ctx.drawImage(img.im, F.x, F.y, F.w, F.h);
  const path = rings => { ctx.beginPath(); rings.forEach(r => r.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](X(p[0]), Y(p[1])))); ctx.closePath(); };
  // القطع المجاورة
  neigh.forEach(n => { if (!n.g || !n.g.rings) return; const rp = n.g.rings.map(r => r.map(webToPG)); path(rp); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = mm(.22); ctx.stroke();
    const b = bboxOf({ rings: rp }), px = X((b[0] + b[2]) / 2), py = Y((b[1] + b[3]) / 2), wpx = X(b[2]) - X(b[0]);
    if (wpx > mm(7) && !(isP && n.a.OBJECTID === a0.OBJECTID)) halo(ctx, String(n.a.PARCEL ?? ""), px, py, `700 ${mm(2.4)}px ${MF}`, "#1d2a22", "rgba(255,255,255,.8)", 4); });
  // القيود: تعبئة شفافة + تهشير + حد
  const used = [];
  frameFeats.forEach(r => { if (!r || r.error) return; const l = r.l;
    r.feats.forEach(ft => { if (!ft.g || !ft.g.rings) return; const rp = ft.g.rings.map(rr2 => rr2.map(webToPG));
      path(rp);
      if (l.kind === "zone") { ctx.strokeStyle = l.c; ctx.lineWidth = mm(.6); ctx.setLineDash([mm(2.5), mm(1.5)]); ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.fillStyle = l.c + "22"; ctx.fill("evenodd"); ctx.fillStyle = hatchPattern(ctx, l.c, l.h || 45); ctx.fill("evenodd"); ctx.strokeStyle = l.c; ctx.lineWidth = mm(.45); ctx.stroke(); }
      if (!used.includes(l)) used.push(l);
    }); });
  // القطعة أو النقطة
  if (isP) {
    path(an.ringsPG); ctx.strokeStyle = "#fff"; ctx.lineWidth = mm(1.5); ctx.stroke(); ctx.strokeStyle = RED; ctx.lineWidth = mm(.8); ctx.stroke();
    an.ringsPG.forEach(r => { const sg = Math.sign(ringArea(r)) || 1; r.forEach((a, i) => { const b = r[(i + 1) % r.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = X(b[0]) - X(a[0]), uy = Y(b[1]) - Y(a[1]), L = Math.hypot(ux, uy); if (L < mm(9) || opts.lens === false) return;
      const nx = -uy / L * -sg, ny = ux / L * -sg; let ang = Math.atan2(uy, ux); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save(); ctx.translate((X(a[0]) + X(b[0])) / 2 + nx * mm(3.2), (Y(a[1]) + Y(b[1])) / 2 + ny * mm(3.2)); ctx.rotate(ang); const s = d.toFixed(2); ctx.font = `700 ${mm(2.8)}px ${MF}`; const tw = ctx.measureText(s).width + mm(2);
      rr(ctx, -tw / 2, -mm(2), tw, mm(4), mm(1)); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = RED; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = "ltr"; ctx.fillText(s, 0, mm(.2)); ctx.restore(); }); });
  } else {
    const px = X(cx), py = Y(cy); ctx.beginPath(); ctx.arc(px, py, mm(2.2), 0, 7); ctx.fillStyle = RED; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = mm(.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, mm(6), 0, 7); ctx.strokeStyle = RED; ctx.lineWidth = mm(.5); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = GREEN; ctx.lineWidth = mm(.6); rr(ctx, F.x, F.y, F.w, F.h, mm(2)); ctx.stroke();
  drawGrid(ctx, F, { gx0, gx1, gy0, gy1, X, Y, gw }, opts.sys === "itm");
  northArrow(ctx, F.x + mm(12), F.y + mm(16), mm(9));
  // مقياس الرسم
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000], target = gw / 5, Lm = nice.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a), Lp = Lm / gw * F.w;
  const sx = F.x + mm(8), sy = F.y + F.h - mm(9);
  rr(ctx, sx - mm(4), sy - mm(11.5), Math.max(Lp, mm(34)) + mm(8), mm(16.5), mm(1.5)); ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#fff" : GREEN; ctx.fillRect(sx + Lp / 4 * i, sy, Lp / 4, mm(1.6)); }
  ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, Lp, mm(1.6));
  txt(ctx, "0", sx, sy - mm(2.6), `600 ${mm(2.6)}px ${MF}`, INK, "center"); txt(ctx, Lm + " م", sx + Lp, sy - mm(2.6), `600 ${mm(2.6)}px ${AF}`, INK, "center");
  txt(ctx, "مقياس الرسم 1:" + S.toLocaleString("en-US"), sx + Math.max(Lp, mm(34)) / 2, sy - mm(8), `700 ${mm(2.8)}px ${AF}`, GREEN, "center");
  // مفتاح الألوان داخل الصورة (أعلى اليمين)
  if (used.length) {
    const lw2 = mm(62), lh = mm(4.6), lx = F.x + F.w - lw2 - mm(3), ly = F.y + mm(3);
    rr(ctx, lx, ly, lw2, lh * (used.length + (isP ? 1 : 0)) + mm(2), mm(1.5)); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill(); ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.stroke();
    const items = (isP ? [{ n: "حدود القطعة", c: RED, line: 1 }] : []).concat(used);
    items.forEach((l, i) => { const y = ly + mm(1) + lh * i + lh / 2, bx = lx + lw2 - mm(8);
      if (l.line) { ctx.strokeStyle = RED; ctx.lineWidth = mm(.8); ctx.strokeRect(bx, y - mm(1.5), mm(5), mm(3)); }
      else if (l.kind === "zone") { ctx.strokeStyle = l.c; ctx.lineWidth = mm(.5); ctx.setLineDash([mm(1.5), mm(1)]); ctx.strokeRect(bx, y - mm(1.5), mm(5), mm(3)); ctx.setLineDash([]); }
      else { ctx.fillStyle = l.c + "33"; ctx.fillRect(bx, y - mm(1.5), mm(5), mm(3)); ctx.fillStyle = hatchPattern(ctx, l.c, l.h || 45); ctx.fillRect(bx, y - mm(1.5), mm(5), mm(3)); ctx.strokeStyle = l.c; ctx.lineWidth = 2; ctx.strokeRect(bx, y - mm(1.5), mm(5), mm(3)); }
      fitTxt(ctx, l.n, bx - mm(2), y, lw2 - mm(12), mm(2.6), "600", AF, INK, "right"); });
  }

  // الجدول
  const drawTable = (k, list, y0, tx0 = mm(10)) => {
    const tx1 = mm(200), lw = mm(48), fsz = mm(3);
    rr(k, tx0, y0, tx1 - tx0, rh * list.length, mm(2)); k.fillStyle = "#fffaf0"; k.fill(); k.strokeStyle = "#d8c79a"; k.lineWidth = 2; k.stroke();
    list.forEach((r, i) => {
      const y = y0 + rh * i;
      if (r[0] === "__h") { k.fillStyle = GREEN_D; k.fillRect(tx0 + 1, y + 1, tx1 - tx0 - 2, rh - 2); fitTxt(k, r[1], tx1 - mm(2.5), y + rh / 2, tx1 - tx0 - mm(5), fsz, "700", TF, "#f3dc93", "right"); return; }
      if (i) { k.strokeStyle = "#eadfbf"; k.lineWidth = 1.5; k.beginPath(); k.moveTo(tx0 + mm(1), y); k.lineTo(tx1 - mm(1), y); k.stroke(); }
      let lab = r[0], sw = null;
      if (lab.startsWith("◼")) { const [kk, nn] = lab.slice(1).split("|"); sw = LBY[kk]; lab = nn; }
      const sub = lab.startsWith("   ");
      if (sw) { k.fillStyle = "rgba(243,234,210,.75)"; k.fillRect(tx0 + 1, y + 1, tx1 - tx0 - 2, rh - 2); k.fillStyle = sw.c + "44"; k.fillRect(tx1 - mm(6.5), y + mm(1.2), mm(4.5), rh - mm(2.4)); k.fillStyle = hatchPattern(k, sw.c, sw.h || 45); k.fillRect(tx1 - mm(6.5), y + mm(1.2), mm(4.5), rh - mm(2.4)); k.strokeStyle = sw.c; k.lineWidth = 2; k.strokeRect(tx1 - mm(6.5), y + mm(1.2), mm(4.5), rh - mm(2.4)); }
      fitTxt(k, lab.trim(), tx1 - mm(2.5) - (sw ? mm(6) : 0) - (sub ? mm(4) : 0), y + rh / 2, lw - mm(4) - (sw ? mm(6) : 0), fsz * (sub ? .92 : 1), sw ? "700" : "600", AF, sw ? GREEN_D : "#5d6458", "right");
      const val = String(r[1]), isNum = /^X /.test(val);
      fitTxt(k, val, isNum ? tx0 + mm(3) : tx1 - lw - mm(3), y + rh / 2, tx1 - tx0 - lw - mm(6), fsz * 1.02, sw ? "700" : "600", isNum ? MF : AF, INK, isNum ? "left" : "right");
    });
  };
  drawTable(ctx, pageRows[0], ty0, mm(60));
  drawStamp(ctx, mm(33), (ty0 + bottom) / 2, Math.max(mm(20), Math.min(mm(26), (bottom - ty0) / 2 - mm(1))));
  for (let pi = 1; pi < pageRows.length; pi++) {
    const c2 = document.createElement("canvas"); c2.width = W; c2.height = H; const k = c2.getContext("2d"); pages.push(c2);
    frameHeader(k, W, "تابع: معلومات " + (isP ? "القطعة" : "الموقع"), isP ? `حوض ${a0.GUSH_NO ?? "—"} · قطعة ${a0.PARCEL ?? "—"}` + (place ? " · " + place : "") : "", "تقرير استرشادي");
    drawTable(k, pageRows[pi], mm(38));
  }
  const last = pages[pages.length - 1].getContext("2d");
  const lastRows = pageRows[pageRows.length - 1].length;
  if (pageRows.length > 1 && mm(38) + rh * lastRows < mm(222)) drawStamp(last, mm(41), mm(252), mm(24));
  pages.forEach((p, i) => { const k = p.getContext("2d"); footerM(k, W, i + 1, pages.length); txt(k, "الصورة الجوية: " + img.name, mm(10), mm(283), `500 ${mm(2.5)}px ${AF}`, "#5d6458", "left"); });

  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297); });
  const name = (isP ? `فحص قطعة ${a0.PARCEL ?? ""} حوض ${a0.GUSH_NO ?? ""} ${place}` : `فحص موقع ${Math.round(cx)}-${Math.round(cy)}`).replace(/[\\/:*?"<>|]/g, "-").trim() + ".pdf";
  if (window.AndroidBridge && AndroidBridge.saveFile) AndroidBridge.saveFile(name, doc.output("datauristring").split(",")[1], "application/pdf");
  else doc.save(name);
  window.__lastPdfPages = pages;
  return name;
}
