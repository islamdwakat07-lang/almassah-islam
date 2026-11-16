/* التصميم اليدوي للإفراز على الصورة الجوية — شوارع بالإصبع، تقسيم البلوكات شبكةً، خط قسمة، دمج، أنواع الاستعمال.
   يعتمد على: S (حالة الإفراز)، polygonClipping، saveFile، toast، fmt من الصفحة. */
(function () {
  "use strict";
  const $i = id => document.getElementById(id);
  const DKEY = "ifraz-design-v1";
  const TYPES = {
    res:   { n: "سكني",      f: "rgba(240,140,30,.55)",  s: "#ffd27a" },
    com:   { n: "تجاري",     f: "rgba(40,110,220,.50)",  s: "#9cc2ff" },
    green: { n: "منطقة خضراء", f: "rgba(60,170,70,.55)",  s: "#a8f0a0" },
    pub:   { n: "مرفق عام",  f: "rgba(120,70,220,.55)",  s: "#d2b8ff" },
    block: { n: "غير مقسّم",  f: "rgba(255,255,255,.18)", s: "#ffffff" }
  };

  /* ---------- الصورة الجوية من جيومولج (تُطلب بنظام إحداثيات الملف نفسه) ---------- */
  const SVC = { "2022": ["Orthophotos_WB_2022_15cm_tif_PG1923_05", 0], "2025": ["Orthophotos_WB_2025_15cm_tif_PG1923", 1], "2019": ["Orthophotos_WB_2019_Aerial_25cm_jpg_PG1923", 0] };
  function sysOf(B) {
    const bb = bboxOf(B), x = (bb[0] + bb[2]) / 2, y = (bb[1] + bb[3]) / 2;
    if (x > 100000 && x < 320000 && y > 450000 && y < 850000) return 2039;      // ITM
    if (x > 80000 && x < 260000 && y > 40000 && y < 360000) return 28191;      // فلسطين القديم
    return 0;
  }
  const bboxOf = p => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; p.forEach(([x, y]) => { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }); return [a, b, c, d]; };
  let AER = null, aerKey = "", aerYear = (() => { try { return localStorage.getItem("ifraz-aer-year") || "2022"; } catch (e) { return "2022"; } })();
  function aerial(B, cb) {
    if (!B || B.length < 3) return null;
    const sr = sysOf(B); if (!sr) return null;
    const bb = bboxOf(B), w = bb[2] - bb[0], h = bb[3] - bb[1], pad = Math.max(40, Math.max(w, h) * 0.35);
    const box = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad], key = box.map(v => v.toFixed(1)).join(",") + "|" + aerYear;
    if (AER && aerKey === key) { if (!AER.ready && cb && !AER.cbs.includes(cb)) AER.cbs.push(cb); return AER.ready ? AER : null; }
    aerKey = key; AER = { box, ready: false, cbs: cb ? [cb] : [] };
    const bw = box[2] - box[0], bh = box[3] - box[1], k = Math.min(1800 / bw, 1800 / bh, 1 / 0.15);
    const size = Math.round(bw * k) + "," + Math.round(bh * k);
    const load = async (yr) => {
      const s = SVC[yr] || SVC["2022"]; let tk = "";
      if (s[1] && window.geoToken) { try { tk = await geoToken(); } catch (e) {} }
      const u = "https://orthophotos.geomolg.ps/adaptor/rest/services/" + s[0] + "/MapServer/export?bbox=" + box.join(",") + "&bboxSR=" + sr + "&imageSR=" + sr + "&size=" + size + "&f=image&format=jpg" + (tk ? "&token=" + tk : "");
      const r = await fetch(u); if (!r.ok) throw new Error("http"); const bl = await r.blob(); if (!/^image\//.test(bl.type) || bl.size < 2000) throw new Error("img");
      return bl;
    };
    const me = AER;
    load(aerYear).catch(() => load("2022")).then(bl => {
      if (me !== AER) return;
      const url = URL.createObjectURL(bl), im = new Image();
      im.onload = () => { if (me !== AER) return; AER.url = url; AER.img = im; AER.ready = true; AER.cbs.forEach(f => { try { f(); } catch (e) {} }); AER.cbs = []; };
      im.src = url;
    }).catch(() => { if (me === AER) AER.failed = true; });
    return null;
  }
  window.ifzAerial = aerial;
  window.ifzAerialYear = () => aerYear;

  /* ---------- الهندسة (بإحداثيات محلية لدقة أعلى) ---------- */
  const PC = () => window.polygonClipping;
  let O = [0, 0];
  const toL = p => [p[0] - O[0], p[1] - O[1]], toW = p => [p[0] + O[0], p[1] + O[1]];
  const ringArea = r => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const openR = r => { const a = r[0], b = r[r.length - 1]; return (r.length > 1 && a[0] === b[0] && a[1] === b[1]) ? r.slice(0, -1) : r; };
  const polyArea = P => P.reduce((t, r, i) => t + (i ? -1 : 1) * Math.abs(ringArea(r)), 0);
  const fromMP = mp => (mp || []).map(pg => pg.map(openR)).filter(pg => pg[0] && pg[0].length > 2 && polyArea(pg) > 0.3);
  const closeP = P => P.map(r => r.concat([r[0]]));
  function inRing(pt, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const inPoly = (pt, P) => inRing(pt, P[0]) && !P.slice(1).some(h => inRing(pt, h));
  function centroidP(P) { const r = P[0]; let a = 0, x = 0, y = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c; } a /= 2; return a ? [x / (6 * a), y / (6 * a)] : r[0]; }
  function labelPt(P) {   // نقطة داخل القطعة لكتابة الرقم
    const c = centroidP(P); if (inPoly(c, P)) return c;
    const bb = bboxOf(P[0]); let best = c, bw = 0;
    for (let t = .2; t < .81; t += .1) { const y = bb[1] + (bb[3] - bb[1]) * t, xs = [];
      P.forEach(r => { for (let i = 0, n = r.length; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } });
      xs.sort((p, q) => p - q); for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y]; } }
    return best;
  }
  function roadPoly(pts, w) {   // شريط بعرض w حول خط الشارع، بزوايا مدوّرة
    const h = w / 2, parts = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
      const nx = -(b[1] - a[1]) / L * h, ny = (b[0] - a[0]) / L * h;
      parts.push([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]);
    }
    for (let i = 1; i + 1 < pts.length; i++) { const c = pts[i], r = []; for (let k = 0; k <= 24; k++) { const t = k / 24 * Math.PI * 2; r.push([c[0] + Math.cos(t) * h, c[1] + Math.sin(t) * h]); } parts.push([r]); }
    return parts.length ? (safePC("union", ...parts) || []) : [];
  }
  /* قصّ مضلع بنصف مستوى a·x + b·y + c ≥ 0 — ثابت عددياً (بدل مكتبة القص للأشكال المستقيمة) */
  function clipHalf(r, A, B, C) {
    const out = [], f = p => A * p[0] + B * p[1] + C;
    for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out.length > 2 ? out : [];
  }
  const clipConvex = (r, cell) => { let o = r; for (let i = 0, n = cell.length; i < n && o.length; i++) { const a = cell[i], b = cell[(i + 1) % n]; o = clipHalf(o, -(b[1] - a[1]), b[0] - a[0], (b[1] - a[1]) * a[0] - (b[0] - a[0]) * a[1]); } return o; };
  function safePC(op, ...g) {   // مكتبة القص مع إعادة المحاولة بإحداثيات مقرّبة
    try { return PC()[op](...g); } catch (e) {
      const q = x => Math.round(x * 1000) / 1000, Q = G => G.map(pg => Array.isArray(pg[0][0]) ? pg.map(r => r.map(p => [q(p[0]), q(p[1])])) : pg.map(p => [q(p[0]), q(p[1])]));
      try { return PC()[op](...g.map(Q)); } catch (e2) { return null; }
    }
  }
  const rot = (p, c, s) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c], unrot = (p, c, s) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

  /* ---------- الحالة ---------- */
  let D = null, land = null, roadsMP = [], undo = [], sel = -1, tool = "pan", draft = [], mergeA = -1, dirIdx = 0;
  const bKey = () => JSON.stringify(S.boundary.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]));
  function loadD() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DKEY) || "null"); } catch (e) {}
    if (!d || d.b !== bKey()) d = { b: bKey(), roads: [], parcels: null, w: 8 };
    D = d;
  }
  const saveD = () => { try { localStorage.setItem(DKEY, JSON.stringify(D)); } catch (e) { toast("الذاكرة ممتلئة، لم يُحفظ التصميم"); } };
  const snap = () => { undo.push(JSON.stringify({ roads: D.roads, parcels: D.parcels, rp: D.rp || [] })); if (undo.length > 60) undo.shift(); };
  function rebuild(keepParcels) {   // الشوارع ← البلوكات
    O = bboxOf(S.boundary).slice(0, 2);
    land = [S.boundary.map(toL)];
    const parts = D.roads.map(r => roadPoly(r.pts.map(toL), r.w)).filter(m => m.length);
    (S.approved || []).forEach(a => parts.push([[a.map(toL).concat([toL(a[0])])]]));
    (D.rp || []).forEach(a => parts.push([[a.map(toL).concat([toL(a[0])])]]));   // طرق مقترح الإفراز الذكي
    const U = parts.length ? safePC("union", ...parts) : null;
    roadsMP = U ? (safePC("intersection", U, closeP(land)) || []) : [];
    if (!keepParcels || !D.parcels) {
      const blocks = parts.length ? fromMP(safePC("difference", closeP(land), ...parts) || [closeP(land)]) : [land];
      D.parcels = blocks.map(P => ({ P: P.map(r => r.map(toW)), t: "block" }));
    }
  }
  const parcelsL = () => D.parcels.map(x => x.P.map(r => r.map(toL)));

  /* ---------- الواجهة ---------- */
  const css = `
  .dz{position:fixed;inset:0;z-index:200;background:#0b1510;display:flex;flex-direction:column;font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;color:#eef3ee}
  .dz-top{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;background:linear-gradient(180deg,#14402b,#0c2a1c);box-shadow:0 2px 0 #c99a2e}
  .dz-top b{font:700 17px "Reem Kufi","IBM Plex Sans Arabic",sans-serif;color:#f3dc93;flex:1}
  .dz-top button,.dz-top select{border:0;border-radius:10px;padding:7px 10px;font:700 13px inherit;background:#f3dc93;color:#0c3b26}
  .dz-map{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;background:#1b2a22}
  .dz-map svg{position:absolute;inset:0;width:100%;height:100%}
  .dz-stats{position:absolute;top:8px;right:8px;left:8px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none}
  .dz-stats span{background:rgba(10,30,20,.82);border:1px solid rgba(243,220,147,.5);border-radius:10px;padding:3px 9px;font-size:12px}
  .dz-stats b{color:#f3dc93;direction:ltr;display:inline-block}
  .dz-hint{position:absolute;bottom:8px;right:8px;left:8px;text-align:center;background:rgba(10,30,20,.85);border-radius:12px;padding:6px 10px;font-size:13.5px;color:#fff6d6;pointer-events:none}
  .dz-panel{background:#122219;border-top:1px solid #2c4a38;padding:8px 10px;display:flex;flex-direction:column;gap:7px}
  .dz-panel .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .dz-panel label{font-size:12.5px;color:#cfe0d4;display:flex;align-items:center;gap:4px}
  .dz-panel input{width:66px!important;padding:6px!important;border-radius:9px!important;border:1.5px solid #6c8f78!important;background:#fffdf6!important;color:#0c3b26!important;font:700 16px "IBM Plex Sans Arabic",sans-serif!important;text-align:center!important;min-height:0!important}
  .dz-panel .pb{border:0;border-radius:10px;padding:8px 11px;font:700 13.5px inherit;background:#1f3a2b;color:#eef3ee;box-shadow:inset 0 0 0 1px #3c5b48}
  .dz-panel .pb.go{background:#e6c35f;color:#0c3b26;box-shadow:none}
  .dz-panel .pb.t{box-shadow:inset 0 0 0 2px var(--c)}
  .dz-panel .pb.on{background:var(--c);color:#0c1510}
  .dz-panel .ttl{font:700 14px inherit;color:#f3dc93}
  .dz-tools{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:6px 6px calc(6px + env(safe-area-inset-bottom,0px));background:#0c2a1c}
  .dz-tools button{border:0;border-radius:11px;padding:6px 2px;background:transparent;color:#cfe0d4;font:600 11px inherit;display:flex;flex-direction:column;align-items:center;gap:1px}
  .dz-tools button i{font-style:normal;font-size:20px}
  .dz-tools button.on{background:#e6c35f;color:#0c3b26}
  .dz-tbl{max-height:30vh;overflow:auto;font-size:13px}
  .dz-tbl table{width:100%!important;min-width:0!important;border-collapse:collapse}.dz-tbl td,.dz-tbl th{padding:4px 6px;border-bottom:1px solid #2c4a38;text-align:right}.dz-tbl td.n{direction:ltr;text-align:left}`;
  let built = false;
  function build() {
    if (built) return; built = true;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const d = document.createElement("div"); d.className = "dz"; d.id = "dz"; d.hidden = true;
    d.innerHTML = `<div class="dz-top"><b>✏️ التصميم على الصورة الجوية</b><select id="dzYear" title="سنة الصورة"><option value="2022">صورة 2022</option><option value="2025">صورة 2025</option><option value="2019">صورة 2019</option></select><button type="button" id="dzX">✕ إغلاق</button></div>
      <div class="dz-map" id="dzMap"><svg id="dzSvg"></svg><div class="dz-stats" id="dzStats"></div><div class="dz-hint" id="dzHint"></div></div>
      <div class="dz-panel" id="dzPanel"></div>
      <div class="dz-tools" id="dzTools">
        <button type="button" data-t="pan"><i>✋</i>تحديد</button><button type="button" data-t="road"><i>🛣️</i>شارع</button><button type="button" data-t="grid"><i>▦</i>تقسيم</button>
        <button type="button" data-t="split"><i>✂️</i>خط قسمة</button><button type="button" data-t="merge"><i>🔗</i>دمج</button><button type="button" data-a="undo"><i>↶</i>تراجع</button><button type="button" data-a="more"><i>⋯</i>المزيد</button></div>`;
    document.body.appendChild(d);
    $i("dzX").onclick = close;
    $i("dzYear").onchange = e => { aerYear = e.target.value; try { localStorage.setItem("ifraz-aer-year", aerYear); } catch (er) {} AER = null; aerKey = ""; aerial(S.boundary, draw); draw(); };
    $i("dzTools").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.t) { setTool(b.dataset.t); return; }
      if (b.dataset.a === "undo") { const u = undo.pop(); if (!u) { toast("لا يوجد ما يُتراجع عنه"); return; } const o = JSON.parse(u); D.roads = o.roads; D.parcels = o.parcels; D.rp = o.rp || []; sel = -1; rebuild(true); saveD(); draw(); panel(); }
      if (b.dataset.a === "more") { tool = "more"; sel = -1; draft = []; panel(); draw(); }
    });
    initPointer();
  }
  function setTool(t) {
    tool = t; draft = []; mergeA = -1; rsel = -1; if (t !== "grid" && t !== "pan") sel = -1;
    document.querySelectorAll("#dzTools [data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    panel(); draw();
  }
  const HINT = { pan: "اضغط على أي قطعة لاختيارها وتغيير نوعها. اسحب لتحريك الصورة، وبإصبعين للتكبير.", road: "", grid: "", split: "اضغط نقطتين لرسم خط يقسم القطعة التي يمر بها.", merge: "اضغط قطعتين متجاورتين لدمجهما.", more: "" };

  /* ---------- اللوحة السفلية حسب الأداة ---------- */
  let gR = 1, gC = 4, gMode = "auto", gW = 20, gDp = 30, aMin = 0, aW = 0, rmode = "free", rOff = 0, rsel = -1, aRoads = false, aRW = 8, aEx = 0, aSlopeOn = false, aSlope = 20;
  const tgtA = () => aEx > 0 ? aEx : aMin;
  const aDef = () => { if (!aMin) aMin = +S.minParcel || 600; if (!aW) aW = +S.minWidth || 15; };
  function panel() {
    const p = $i("dzPanel"); let h = "";
    if (tool === "road") {
      const RM = [["free", "✍️ حر"], ["par", "∥ موازٍ لضلع"], ["perp", "⟂ عمودي على ضلع"], ["edit", "✋ تعديل شارع"]];
      h = `<div class="r">${RM.map(([k, n]) => `<button class="pb ${rmode === k ? "go" : ""}" type="button" data-rm="${k}">${n}</button>`).join("")}</div>`;
      if (rmode === "edit") {
        const R = D.roads[rsel];
        h += R ? `<div class="r"><span class="ttl">الشارع المختار</span><label>العرض (م)<input id="dzEW" type="number" min="2" step="0.5" value="${R.w}"></label><button class="pb" type="button" id="dzEDel">🗑 حذف هذا الشارع</button><button class="pb go" type="button" id="dzEOk">✓ تم</button></div><div class="r" style="font-size:12.5px;color:#cfe0d4">اسحب النقاط البيضاء لتغيير مسار الشارع.</div>`
          : `<div class="r" style="font-size:12.5px;color:#cfe0d4">${D.roads.length ? "اضغط على الشارع الذي تريد تعديله." : "لا توجد شوارع مرسومة بعد."}</div>`;
      } else {
        h += `<div class="r"><label>العرض (م)<input id="dzRW" type="number" min="2" step="0.5" value="${D.w || 8}"></label>${rmode === "par" ? `<label>البعد عن الضلع (م)<input id="dzROff" type="number" min="0" step="0.5" value="${rOff}"></label>` : ""}${rmode === "free" ? `<span style="font-size:12.5px;color:#cfe0d4">${draft.length} نقاط</span>` : ""}</div>`;
        h += rmode === "free" ? `<div class="r"><button class="pb go" type="button" id="dzRDone">✓ إنهاء الشارع</button><button class="pb" type="button" id="dzRBack">↶ نقطة</button><button class="pb" type="button" id="dzRCancel">إلغاء</button>${D.roads.length ? `<button class="pb" type="button" id="dzRDel">🗑 حذف آخر شارع</button>` : ""}</div>`
          : `<div class="r" style="font-size:12.5px;color:#cfe0d4">${rmode === "par" ? "اضغط قرب ضلع الأرض: يُرسم شارع موازٍ له بالبعد المكتوب (0 = ملاصق للضلع من الداخل)." : "اضغط على ضلع الأرض في المكان الذي يبدأ منه الشارع: يُرسم عمودياً عليه ويقطع الأرض."}</div>`;
      }
    }
    else if (tool === "grid") {
      if (sel < 0) { aDef(); h = `<div class="r"><span class="ttl">▦ اضغط على البلوك أو الجزء الذي تريد إفرازه</span></div><div class="r"><label>مساحة النمرة (م²)<input id="dzAE" type="number" min="0" step="10" value="${aEx || ""}" placeholder="—"></label><label>أقل مساحة (م²)<input id="dzAM" type="number" min="50" step="10" value="${aMin}"></label><label>أقل عرض (م)<input id="dzAW" type="number" min="3" step="0.5" value="${aW}"></label><label style="flex-basis:100%"><input id="dzAR" type="checkbox" style="width:auto!important;min-width:0!important" ${aRoads ? "checked" : ""}> 🛣️ اقترح طرقاً داخلية تصل للقسائم، عرضها <input id="dzARW" type="number" min="3" step="0.5" value="${aRW}"> م</label>${aRoads ? `<label style="flex-basis:100%"><input id="dzAS" type="checkbox" style="width:auto!important;min-width:0!important" ${aSlopeOn ? "checked" : ""}> ⛰️ راعِ الميل من كنتور جيومولج: أقصى ميل للطريق <input id="dzASV" type="number" min="3" max="40" step="1" value="${aSlope}"> %</label>` : ""}<button class="pb" type="button" id="dzGAll">⚡ إفراز كل البلوكات تلقائياً</button><span id="dzAInfo" style="font-size:12.5px;color:#f3dc93"></span></div>`; }
      else h = `<div class="r"><span class="ttl">▦ تقسيم القطعة (${fmt(polyArea(parcelsL()[sel]))} م²)</span></div>
        <div class="r"><button class="pb ${gMode === "auto" ? "go" : ""}" type="button" data-gm="auto">⚡ تلقائي بالشروط</button><button class="pb ${gMode === "count" ? "go" : ""}" type="button" data-gm="count">بالعدد</button><button class="pb ${gMode === "size" ? "go" : ""}" type="button" data-gm="size">بالأبعاد</button></div><div class="r">
        ${gMode === "auto" ? (aDef(), `<label>مساحة النمرة (م²)<input id="dzAE" type="number" min="0" step="10" value="${aEx || ""}" placeholder="—"></label><label>أقل مساحة (م²)<input id="dzAM" type="number" min="50" step="10" value="${aMin}"></label><label>أقل عرض (م)<input id="dzAW" type="number" min="3" step="0.5" value="${aW}"></label><label style="flex-basis:100%"><input id="dzAR" type="checkbox" style="width:auto!important;min-width:0!important" ${aRoads ? "checked" : ""}> 🛣️ اقترح طرقاً داخلية تصل للقسائم، عرضها <input id="dzARW" type="number" min="3" step="0.5" value="${aRW}"> م</label>${aRoads ? `<label style="flex-basis:100%"><input id="dzAS" type="checkbox" style="width:auto!important;min-width:0!important" ${aSlopeOn ? "checked" : ""}> ⛰️ راعِ الميل من كنتور جيومولج: أقصى ميل للطريق <input id="dzASV" type="number" min="3" max="40" step="1" value="${aSlope}"> %</label>` : ""}<span id="dzAInfo" style="font-size:12.5px;color:#f3dc93"></span>`) : gMode === "count" ? `<label>صفوف<input id="dzGR" type="number" min="1" value="${gR}"></label><label>أعمدة<input id="dzGC" type="number" min="1" value="${gC}"></label>` : `<label>الواجهة (م)<input id="dzGW" type="number" min="3" step="0.5" value="${gW}"></label><label>العمق (م)<input id="dzGD" type="number" min="3" step="0.5" value="${gDp}"></label>`}</div>
        <div class="r"><button class="pb" type="button" id="dzGDir">🔄 ${gMode === "auto" ? "تغيير الواجهة" : "تدوير الاتجاه"}</button><button class="pb go" type="button" id="dzGGo">✓ قسّم</button>${gMode === "auto" ? `<button class="pb" type="button" id="dzGAll">⚡ كل البلوكات غير المقسمة</button>` : ""}</div>`;
    } else if (tool === "pan" && sel >= 0) {
      const x = D.parcels[sel];
      h = `<div class="r"><span class="ttl">القطعة ${x.t === "res" ? "رقم " + numOf(sel) : ""} — ${fmt(polyArea(parcelsL()[sel]))} م²</span></div><div class="r">` +
        Object.entries(TYPES).filter(([k]) => k !== "block").map(([k, v]) => `<button class="pb t${x.t === k ? " on" : ""}" type="button" data-ty="${k}" style="--c:${v.s}">${v.n}</button>`).join("") + `</div>`;
    } else if (tool === "more") {
      const rows = tableRows();
      h = `<div class="r"><button class="pb go" type="button" id="dzPdf">📄 تصدير PDF</button><button class="pb go" type="button" id="dzDxf">📐 تصدير DXF</button><button class="pb" type="button" id="dzAllRes">كل غير المقسّم ← سكني</button><button class="pb" type="button" id="dzReset">🗑 البدء من جديد</button></div>
        <div class="dz-tbl"><table><tr><th style="width:22%">رقم</th><th style="width:40%">النوع</th><th>المساحة م²</th></tr>${rows.map(r => `<tr><td>${r.no}</td><td>${r.type}</td><td class="n" style="color:#f3dc93;font-weight:700">${fmt(r.a)}</td></tr>`).join("")}</table></div>`;
    }
    p.innerHTML = h; p.hidden = !h;
    $i("dzHint").textContent = HINT[tool] || ""; $i("dzHint").hidden = !HINT[tool] || (tool === "pan" && sel >= 0);
    const on = (id, f) => { const e = $i(id); if (e) e.onclick = f; };
    on("dzRDone", finishRoad); on("dzRBack", () => { draft.pop(); panel(); draw(); }); on("dzRCancel", () => { draft = []; panel(); draw(); });
    on("dzRDel", () => { snap(); D.roads.pop(); rebuild(false); sel = -1; saveD(); panel(); draw(); toast("حُذف آخر شارع، وأُعيد حساب البلوكات"); });
    const rw = $i("dzRW"); if (rw) rw.oninput = () => { D.w = +rw.value || 8; draw(); };
    p.querySelectorAll("[data-gm]").forEach(b => b.onclick = () => { gMode = b.dataset.gm; panel(); draw(); });
    ["dzGR", "dzGC", "dzGW", "dzGD"].forEach(id => { const e = $i(id); if (e) e.oninput = () => { gR = Math.max(1, +($i("dzGR") || {}).value || gR); gC = Math.max(1, +($i("dzGC") || {}).value || gC); gW = +($i("dzGW") || {}).value || gW; gDp = +($i("dzGD") || {}).value || gDp; draw(); }; });
    on("dzGDir", () => { dirIdx++; draw(); panelInfo(); }); on("dzGGo", doGrid); on("dzGAll", doAutoAll);
    ["dzAM", "dzAW"].forEach(id => { const e = $i(id); if (e) e.oninput = () => { aMin = Math.max(20, +($i("dzAM") || {}).value || aMin); aW = Math.max(1, +($i("dzAW") || {}).value || aW); draw(); panelInfo(); }; });
    const ae = $i("dzAE"); if (ae) ae.oninput = () => { aEx = Math.max(0, +ae.value || 0); draw(); panelInfo(); };
    const ar = $i("dzAR"); if (ar) ar.onchange = () => { aRoads = ar.checked; panel(); draw(); };
    const as = $i("dzAS"); if (as) as.onchange = () => { aSlopeOn = as.checked; autoC.k = ""; if (aSlopeOn) loadContours(); draw(); panelInfo(); };
    const asv = $i("dzASV"); if (asv) asv.oninput = () => { aSlope = Math.max(1, +asv.value || 20); autoC.k = ""; draw(); panelInfo(); };
    const arw = $i("dzARW"); if (arw) arw.oninput = () => { aRW = Math.max(2, +arw.value || 8); draw(); panelInfo(); };
    p.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { rmode = b.dataset.rm; draft = []; rsel = -1; panel(); draw(); });
    const ro = $i("dzROff"); if (ro) ro.oninput = () => { rOff = Math.max(0, +ro.value || 0); };
    const ew = $i("dzEW"); if (ew) ew.onchange = () => { const v = +ew.value; if (!(v >= 1) || rsel < 0) return; snap(); D.roads[rsel].w = v; rebuild(false); saveD(); draw(); toast("تغيّر عرض الشارع وأُعيد حساب البلوكات"); };
    on("dzEDel", () => { if (rsel < 0) return; snap(); D.roads.splice(rsel, 1); rsel = -1; rebuild(false); sel = -1; saveD(); panel(); draw(); toast("حُذف الشارع"); });
    on("dzEOk", () => { rsel = -1; panel(); draw(); });
    panelInfo();
    p.querySelectorAll("[data-ty]").forEach(b => b.onclick = () => { snap(); D.parcels[sel].t = b.dataset.ty; saveD(); panel(); draw(); });
    on("dzPdf", exportPDF); on("dzDxf", exportDXF);
    on("dzAllRes", () => { snap(); D.parcels.forEach(x => { if (x.t === "block") x.t = "res"; }); saveD(); panel(); draw(); });
    on("dzReset", () => { if (!confirmTwice()) return; snap(); D.roads = []; D.rp = []; rebuild(false); sel = -1; saveD(); panel(); draw(); });
  }
  function panelInfo() {
    const el = $i("dzAInfo"); if (!el) return;
    const cst = aSlopeOn ? (CT.st === "loading" ? " ⏳ جاري تحميل الكنتور…" : CT.st === "err" ? " ⚠️ " + CT.msg : CT.st === "ok" ? ` ⛰️ الكنتور محمّل (كل ${CT.step} م، منسوب ${fmt(CT.zmin, 0)}–${fmt(CT.zmax, 0)})` : "") : "";
    if (sel < 0) { el.textContent = cst; return; }
    const r = autoLots(parcelsL()[sel]);
    el.textContent = r.lots.length ? `← ${r.lots.length} قسيمة` + (r.bad ? ` (${r.bad} لا تحقق الشروط)` : (aEx > 0 ? ` بمساحة ${fmt(aEx, 0)} م²` : `، كل واحدة ≈ ${fmt(r.lots.reduce((t, l) => t + Math.abs(ringArea(l)), 0) / r.lots.length)} م²`)) : "لا تتسع لقسيمة واحدة";
    if (r.rest && r.rest.length) el.textContent += ` + باقي ${fmt(r.rest.reduce((t, g) => t + Math.abs(ringArea(g)), 0), 0)} م² غير مقسّم`;
    if (r.roads && r.roads.length) el.textContent += ` + ${r.how} (${fmt(r.ra, 0)} م² طرق)`;
    if (r.g != null) el.textContent += ` · أقصى ميل للطرق ${(r.g * 100).toFixed(1)}% ` + (r.g > aSlope / 100 + 1e-9 ? `⚠️ أعلى من ${aSlope}% (جُرّب ${r.tried} تخطيطاً ولم يتحقق الحد؛ غيّر الواجهة أو ارسم الطريق يدوياً)` : "✓");
    el.textContent += cst;
    if (r.deep) el.textContent += ` — العمق ${fmt(r.deep, 0)} م كبير، فعّل «اقترح طرقاً داخلية» أو ارسم شارعاً`;
  }
  let askT = 0; const confirmTwice = () => { if (Date.now() - askT < 3000) { askT = 0; return true; } askT = Date.now(); toast("اضغط مرة ثانية للتأكيد"); return false; };

  /* ---------- العمليات ---------- */
  /* شارع موازٍ لضلع أو عمودي عليه */
  function edgeRoad(p) {
    const Lr = land[0]; let bi = -1, bd = Infinity;
    Lr.forEach((a, i) => { const d = distSeg(p, a, Lr[(i + 1) % Lr.length]); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0 || bd * V.k > 60) { toast("اضغط أقرب إلى ضلع الأرض"); return; }
    const a = Lr[bi], b = Lr[(bi + 1) % Lr.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let nx = -uy, ny = ux; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (!inRing([m[0] + nx * 0.5, m[1] + ny * 0.5], Lr)) { nx = -nx; ny = -ny; }
    const w = D.w || 8;
    let pts;
    // أطراف الشارع تمتد قليلاً خارج الأرض فقط، لتسهل سحبها
    const du = Lr.map(v => (v[0] - a[0]) * ux + (v[1] - a[1]) * uy), dn = Lr.map(v => (v[0] - a[0]) * nx + (v[1] - a[1]) * ny);
    if (rmode === "par") { const o = rOff + w / 2, t0 = Math.min(...du) - 3, t1 = Math.max(...du) + 3; pts = [[a[0] + ux * t0 + nx * o, a[1] + uy * t0 + ny * o], [a[0] + ux * t1 + nx * o, a[1] + uy * t1 + ny * o]]; }
    else { const t = Math.max(w / 2, Math.min(L - w / 2, (p[0] - a[0]) * ux + (p[1] - a[1]) * uy)), q = [a[0] + ux * t, a[1] + uy * t], e = Math.max(...dn) + 3; pts = [[q[0] - nx * 2, q[1] - ny * 2], [q[0] + nx * e, q[1] + ny * e]]; }
    snap(); D.roads.push({ pts: pts.map(toW), w }); rebuild(false); sel = -1; saveD(); panel(); draw();
    toast((rmode === "par" ? "أُضيف شارع موازٍ للضلع " : "أُضيف شارع عمودي على الضلع ") + (bi + 1) + "، وصار عندك " + D.parcels.length + " بلوك");
  }
  function finishRoad() {
    if (draft.length < 2) { toast("اضغط نقطتين على الأقل لمسار الشارع"); return; }
    snap(); D.roads.push({ pts: draft.map(toW), w: D.w || 8 }); draft = []; rebuild(false); sel = -1; saveD(); panel(); draw();
    toast("أُضيف الشارع، وصار عندك " + D.parcels.length + " بلوك. اختر «تقسيم» لتقسيم كل بلوك.");
  }
  function gridDir(P) {   // اتجاه القسمة: أضلاع القطعة مرتبة من الأطول
    const r = P[0], ed = r.map((a, i) => { const b = r[(i + 1) % r.length]; return { L: Math.hypot(b[0] - a[0], b[1] - a[1]), th: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }).sort((x, y) => y.L - x.L);
    const uniq = []; ed.forEach(e => { const t = ((e.th % Math.PI) + Math.PI) % Math.PI; if (!uniq.some(u => Math.abs(u - t) < 0.05 || Math.abs(Math.abs(u - t) - Math.PI) < 0.05)) uniq.push(t); });
    return uniq[dirIdx % uniq.length] || 0;
  }
  function gridCells(P) {
    const th = gridDir(P), c = Math.cos(th), s = Math.sin(th), R = P[0].map(p => rot(p, c, s)), bb = bboxOf(R);
    const W = bb[2] - bb[0], H = bb[3] - bb[1];
    const C = gMode === "count" ? gC : Math.max(1, Math.round(W / gW)), Rr = gMode === "count" ? gR : Math.max(1, Math.round(H / gDp));
    // بالعدد: خطوط القسمة بحيث تتساوى المساحات؛ بالأبعاد: أبعاد ثابتة
    const us = gMode === "count" ? eqCuts(R, 0, C, bb) : Array.from({ length: C + 1 }, (_, k) => bb[0] + W * k / C);
    const vs = gMode === "count" ? eqCuts(R, 1, Rr, bb) : Array.from({ length: Rr + 1 }, (_, k) => bb[1] + H * k / Rr);
    const cells = [];
    for (let j = 0; j < C; j++) {
      // بالعدد: كل عمود يُقسم صفوفاً متساوية المساحة داخله، فتتساوى كل القسائم
      let vj = vs;
      if (gMode === "count" && Rr > 1) { const strip = clipHalf(clipHalf(R, 1, 0, -us[j]), -1, 0, us[j + 1]); if (strip.length) vj = eqCuts(strip, 1, Rr, bboxOf(strip)); vj[0] = bb[1]; vj[Rr] = bb[3]; }
      for (let i = 0; i < Rr; i++) {
      const u0 = us[j], u1 = us[j + 1], v0 = vj[i], v1 = vj[i + 1];
      const e = 0.5, a0 = j ? u0 : u0 - e, a1 = j < C - 1 ? u1 : u1 + e, b0 = i ? v0 : v0 - e, b1 = i < Rr - 1 ? v1 : v1 + e;
      cells.push([[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(p => unrot(p, c, s)));
    } }
    return cells;
  }
  function eqCuts(R, ax, n, bb) {   // مواضع n-1 خطاً تقسم المساحة بالتساوي على المحور ax
    const lo = bb[ax], hi = bb[ax + 2], tot = Math.abs(ringArea(R)), cuts = [lo];
    const left = t => { const r = clipHalf(R, ax ? 0 : -1, ax ? -1 : 0, t); return r.length ? Math.abs(ringArea(r)) : 0; };
    for (let k = 1; k < n; k++) { let a = cuts[k - 1], b = hi; for (let it = 0; it < 50; it++) { const m = (a + b) / 2; if (left(m) < tot * k / n) a = m; else b = m; } cuts.push((a + b) / 2); }
    cuts.push(hi); return cuts;
  }
  /* ---------- الإفراز التلقائي لجزء بشروط (أقل مساحة + أقل عرض) ----------
     الواجهة = أطول ضلع للجزء على شارع (أو على الشارع الخارجي للأرض). القسائم متعامدة على الواجهة، بمساحات متساوية،
     وعددها أكبر عدد ممكن بحيث لا تقل أي قسيمة عن المساحة والعرض المطلوبين. إن كان للجزء شارعان متقابلان وعمقه كبير يُقسم صفين. */
  const distSeg = (m, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(m[0] - a[0] - t * dx, m[1] - a[1] - t * dy); };
  function frontEdges(r) {
    const RP = fromMP(roadsMP), ext = new Set([...(S.roadEdges || []), S.street || 0]), Lr = land[0], out = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1) continue;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      let po = [m[0] + nx * 0.6, m[1] + ny * 0.6]; if (inRing(po, r)) po = [m[0] - nx * 0.6, m[1] - ny * 0.6];
      let on = RP.some(P => inPoly(po, P));
      if (!on && !inRing(po, Lr)) for (const j of ext) { if (j < Lr.length && distSeg(m, Lr[j], Lr[(j + 1) % Lr.length]) < 0.05) { on = true; break; } }
      if (on) out.push({ a, b, len, th: Math.atan2(b[1] - a[1], b[0] - a[0]) });
    }
    return out;
  }
  const sameTh = (x, y) => { const d = Math.abs((((x - y) % Math.PI) + Math.PI) % Math.PI); return d < 0.06 || Math.PI - d < 0.06; };
  function chordU(R, v) { const xs = []; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) xs.push(a[0] + (v - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } return xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0; }
  function minWU(R) { const bb = bboxOf(R); let m = Infinity; for (let t = 0.2; t < 0.81; t += 0.075) m = Math.min(m, chordU(R, bb[1] + (bb[3] - bb[1]) * t)); return isFinite(m) ? m : 0; }
  /* ---------- الكنتور من جيومولج ونموذج الارتفاعات ---------- */
  const SQLC = "https://sql.geomolg.ps/adaptor/rest/services/ContourLines_02/MapServer/";
  const nh = {}; let nhSeq = 0;
  function netGet(url) {
    if (window.AndroidBridge && AndroidBridge.httpGet) {
      const prev = window.onNativeHttp;
      if (!(prev && prev.__dz)) { const f = (id, st, tx) => { if (nh[id]) { const cb = nh[id]; delete nh[id]; cb({ status: st, text: String(tx || "") }); } else if (prev) prev(id, st, tx); }; f.__dz = 1; window.onNativeHttp = f; }
      return new Promise((ok, no) => { const id = "dz" + (++nhSeq); nh[id] = r => r.status === -1 ? no(new Error(r.text)) : ok(r); try { AndroidBridge.httpGet(id, url, false); } catch (e) { delete nh[id]; no(e); } });
    }
    return fetch(url).then(async r => ({ status: r.status, text: await r.text() }));
  }
  let CT = { key: "", st: "", lines: [] };
  const slopeReady = () => aSlopeOn && CT.st === "ok";
  function pickZ(j) {
    const num = /Double|Integer|Single|SmallInteger/i, skip = /objectid|^fid|shape|length|area|^id$|_id$/i;
    const fs = (j.fields || []).filter(f => num.test(f.type) && !skip.test(f.name));
    const named = fs.find(f => /elev|contour|height|hgt|^z$|alt|منسوب|level|value/i.test(f.name + " " + (f.alias || "")));
    if (named) return named.name;
    const at = (j.features || []).map(f => f.attributes || {}), keys = at.length ? Object.keys(at[0]) : [];
    let best = null, bn = 0;
    keys.filter(k => !skip.test(k)).forEach(k => { const v = at.map(a => +a[k]).filter(x => isFinite(x)); if (v.length < at.length * 0.9 || v.some(x => x < -450 || x > 1300)) return; const n = new Set(v).size; if (n > bn) { bn = n; best = k; } });
    return best;
  }
  async function loadContours() {
    const sr = sysOf(S.boundary), bb = bboxOf(S.boundary), pad = 40, key = bb.map(v => v.toFixed(0)).join(",");
    if (!sr) { CT = { key, st: "err", lines: [], msg: "إحداثيات الأرض ليست بنظام فلسطيني أو ITM" }; panelInfo(); return; }
    if (CT.key === key && (CT.st === "ok" || CT.st === "loading")) return;
    CT = { key, st: "loading", lines: [] }; panelInfo();
    for (const lay of [0, 1]) {
      try {
        const q = new URLSearchParams({ geometry: [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad].map(v => v.toFixed(1)).join(","), geometryType: "esriGeometryEnvelope", inSR: sr, outSR: sr, spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "true", maxAllowableOffset: "0.3", geometryPrecision: "2", f: "json" });
        const r = await netGet(SQLC + lay + "/query?" + q); const j = JSON.parse(r.text);
        if (j.error || !j.features || !j.features.length) throw 0;
        const zf = pickZ(j); if (!zf) throw 0;
        const lines = j.features.map((f, id) => ({ id, z: +f.attributes[zf], paths: ((f.geometry || {}).paths || []).map(pp => pp.map(q2 => toL(q2))) })).filter(l => isFinite(l.z) && l.paths.length);
        if (lines.length < 2) throw 0;
        CT = { key, st: "ok", lines, step: lay ? 5 : 1 }; buildDEM(); autoC.k = ""; draw(); panelInfo(); return;
      } catch (e) {}
    }
    CT = { key, st: "err", lines: [], msg: "تعذّر تحميل الكنتور من جيومولج (تأكد من الإنترنت)" }; autoC.k = ""; panelInfo();
  }
  function buildDEM() {
    const H = new Map(); let zmin = Infinity, zmax = -Infinity;
    CT.lines.forEach(L => { zmin = Math.min(zmin, L.z); zmax = Math.max(zmax, L.z); L.paths.forEach(pp => { for (let i = 0; i + 1 < pp.length; i++) { const a = pp[i], b = pp[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)); for (let k = 0; k < n; k++) { const q = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], key = Math.floor(q[0] / 10) + "," + Math.floor(q[1] / 10); if (!H.has(key)) H.set(key, []); H.get(key).push([q[0], q[1], L.z, L.id]); } } }); });
    CT.H = H; CT.zmin = zmin; CT.zmax = zmax;
  }
  function zAt(p) {   // استيفاء بين أقرب خطوط كنتور مختلفة (وزن عكسي للمسافة)
    const cx = Math.floor(p[0] / 10), cy = Math.floor(p[1] / 10), near = new Map();
    for (let rr = 0; rr <= 10; rr++) {
      for (let i = cx - rr; i <= cx + rr; i++) for (let j = cy - rr; j <= cy + rr; j++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== rr) continue;
        (CT.H.get(i + "," + j) || []).forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), e = near.get(q[3]); if (!e || d < e.d) near.set(q[3], { d, z: q[2] }); });
      }
      if (near.size >= 2 && rr >= 2) break;
    }
    const L = [...near.values()].sort((a, b) => a.d - b.d).slice(0, 2); if (!L.length) return NaN;
    if (L[0].d < 0.05) return L[0].z;
    let sw = 0, sz = 0; L.forEach(x => { const w = 1 / x.d; sw += w; sz += w * x.z; }); return sz / sw;
  }
  function gradeOf(pts) {   // أقصى ميل على مسافة 10 م على طول المسار
    if (pts.length < 2) return 0;
    const sArr = [0], z = pts.map(zAt); for (let i = 1; i < pts.length; i++) sArr.push(sArr[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let g = 0, j = 0;
    for (let i = 0; i < pts.length; i++) { while (j < pts.length - 1 && sArr[j] - sArr[i] < 10) j++; const ds = sArr[j] - sArr[i]; if (ds > 3 && isFinite(z[i]) && isFinite(z[j])) g = Math.max(g, Math.abs(z[j] - z[i]) / ds); }
    return g;
  }
  function slopeOf(r) {   // مستوى مُلائم: الميل العام واتجاهه داخل الجزء
    const bb = bboxOf(r), P = [];
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) { const q = [bb[0] + (bb[2] - bb[0]) * i / 12, bb[1] + (bb[3] - bb[1]) * j / 12]; if (inRing(q, r)) { const z = zAt(q); if (isFinite(z)) P.push([q[0], q[1], z]); } }
    if (P.length < 6) return null;
    const m = [0, 0, 0].map((_, k) => P.reduce((t, q) => t + q[k], 0) / P.length);
    let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0; P.forEach(q => { const x = q[0] - m[0], y = q[1] - m[1], z = q[2] - m[2]; xx += x * x; xy += x * y; yy += y * y; xz += x * z; yz += y * z; });
    const det = xx * yy - xy * xy; if (Math.abs(det) < 1e-9) return null;
    const a = (xz * yy - yz * xy) / det, b = (yz * xx - xz * xy) / det; return { a, b, S: Math.hypot(a, b) };
  }
  let autoC = { k: "", r: null };
  function autoLots(P) {
    aDef();
    const r = P[0], key = JSON.stringify(r.slice(0, 6)) + r.length + "|" + dirIdx + "|" + aMin + "|" + aW + "|" + aRoads + aRW + "|" + aEx + "|" + (slopeReady() ? aSlope + CT.key : "");
    if (autoC.k === key) return autoC.r;
    const fe = frontEdges(r), dirs = [];
    const addDir = (th, w, f) => { const e = dirs.find(d => sameTh(d.th, th)); if (e) { e.w += w; e.f = e.f || f; } else dirs.push({ th, w, f }); };
    fe.forEach(e => addDir(e.th, e.len * 1000, true));
    r.forEach((a, i) => { const b = r[(i + 1) % r.length]; addDir(Math.atan2(b[1] - a[1], b[0] - a[0]), Math.hypot(b[0] - a[0], b[1] - a[1]), false); });
    dirs.sort((x, y) => y.w - x.w);
    const D0 = dirs[dirIdx % dirs.length], th = D0.th, c = Math.cos(th), s = Math.sin(th);
    const R = r.map(p => rot(p, c, s)), bb = bboxOf(R), H = bb[3] - bb[1];
    const fv = fe.filter(e => sameTh(e.th, th)).map(e => (rot(e.a, c, s)[1] + rot(e.b, c, s)[1]) / 2);
    const lowF = fv.some(v => v < bb[1] + H / 2), highF = fv.some(v => v >= bb[1] + H / 2);
    const f = Math.max(aW, Math.sqrt(tgtA() * 1.05 / 1.25)), dT = tgtA() * 1.05 / f;
    const bands = lowF && highF && H > 1.6 * dT ? [[bb[1] - 1, (bb[1] + bb[3]) / 2], [(bb[1] + bb[3]) / 2, bb[3] + 1]] : [[bb[1] - 1, bb[3] + 1]];
    const lots = [], rest0 = []; let bad = 0;
    for (const [v0, v1] of bands) {
      const row = clipHalf(clipHalf(R, 0, 1, -v0), 0, -1, v1); if (!row.length) continue;
      const k = cutRow(row, 0); if (!k.ok) bad++;
      k.lots.forEach(g => lots.push(g.map(p => unrot(p, c, s)))); (k.rest || []).forEach(g => rest0.push(g.map(p => unrot(p, c, s))));
    }
    let res = { lots, bad, rest: rest0, roads: [], ra: 0, front: D0.f, deep: bands.length === 1 && H > 2.2 * dT ? H : 0 };
    if (aRoads) {   // اقتراح طرق داخلية: نجرب عدة تخطيطات (ومع الميل: طرق موازية للكنتور) ونختار الأفضل
      let all = withRoads(R, lowF, highF, dT, p => unrot(p, c, s));
      if (slopeReady()) all = all.concat(contourRoads(r, fe, dT));
      const lim = aSlope / 100, over = x => (slopeReady() && x.g != null && x.g > lim + 1e-9) ? 1 : 0;
      all.sort((a, b) => over(a) - over(b) || a.bad - b.bad || b.lots.length - a.lots.length || (slopeReady() ? a.g - b.g : 0) || a.ra - b.ra);
      const alt = all[0];
      if (alt && (alt.bad < res.bad || (alt.bad === res.bad && alt.lots.length > res.lots.length) || (slopeReady() && res.deep)))
        res = { ...alt, front: true, deep: 0, tried: all.length, overAll: all.every(x => over(x)) };
    }
    autoC = { k: key, r: res }; return res;
  }
  /* تقسيم صف واحد: القسائم جنباً إلى جنب (ax=0: الخطوط عمودية على u، ax=1: على v)، أكبر عدد متساوٍ يحقق الشروط */
  function cutRow(row, ax) {
    const T = ax ? (p => [p[1], -p[0]]) : (p => p), Ti = ax ? (p => [-p[1], p[0]]) : (p => p);
    const Rr = row.map(T), A = Math.abs(ringArea(Rr)), rb = bboxOf(Rr);
    if (aEx > 0) {   // مساحة محددة لكل نمرة: نمر بالمساحة بالضبط من بداية الصف، والباقي في آخره
      const n = Math.floor(A / aEx + 1e-6); if (n < 1) return { lots: [row], ok: false };
      const left = t => { const g = clipHalf(Rr, -1, 0, t); return g.length ? Math.abs(ringArea(g)) : 0; };
      const cuts = [rb[0] - 1];
      for (let k = 1; k <= n; k++) { if (k === n && A - n * aEx < 0.05) { cuts.push(rb[2] + 1); break; } let a = cuts[k - 1], b = rb[2] + 1; for (let it = 0; it < 55; it++) { const m = (a + b) / 2; if (left(m) < aEx * k) a = m; else b = m; } cuts.push((a + b) / 2); }
      const L = []; for (let k = 0; k < n; k++) { const g = clipHalf(clipHalf(Rr, 1, 0, -cuts[k]), -1, 0, cuts[k + 1]); if (g.length) L.push(g); }
      const tail = cuts[n] < rb[2] ? clipHalf(Rr, 1, 0, -cuts[n]) : [], rest = [];
      if (tail.length && Math.abs(ringArea(tail)) > 0.5) { if (Math.abs(ringArea(tail)) >= aMin - 0.01 && minWU(tail) >= aW - 0.01) L.push(tail); else rest.push(tail); }
      return { lots: L.map(g => g.map(Ti)), rest: rest.map(g => g.map(Ti)), ok: L.every(g => minWU(g) >= aW - 0.01) };
    }
    let n = Math.max(1, Math.min(Math.floor(A / aMin + 1e-9), Math.floor((rb[2] - rb[0]) / aW + 1e-9)));
    const okG = g => Math.abs(ringArea(g)) >= aMin - 0.01 && minWU(g) >= aW - 0.01;
    const cell = (bs, k) => clipHalf(clipHalf(Rr, 1, 0, -(k ? bs[k] : bs[k] - 1)), -1, 0, k < bs.length - 2 ? bs[k + 1] : bs[k + 1] + 1);
    let eq = null;
    for (let m = n; m >= 1 && !eq; m--) { const us = eqCuts(Rr, 0, m, rb), L = []; for (let k = 0; k < m; k++) { const g = cell(us, k); if (g.length) L.push(g); } if (L.every(okG)) eq = L; }
    // بديل: أبعاد متساوية للواجهة، والقطع الطرفية الضيقة (عند ضلع مائل) تُضم لجارتها — قسائم أكثر عند الأطراف المائلة
    let un = null;
    for (let m = n; m >= 1 && !un; m--) {
      const bs = Array.from({ length: m + 1 }, (_, k) => rb[0] + (rb[2] - rb[0]) * k / m);
      for (let guard = 0; guard < m; guard++) {
        const G = bs.slice(0, -1).map((_, k) => cell(bs, k)), i = G.findIndex(g => !g.length || !okG(g));
        if (i < 0 || bs.length <= 2) break;
        const left = i > 0 ? Math.abs(ringArea(G[i - 1])) : Infinity, right = i < G.length - 1 ? Math.abs(ringArea(G[i + 1])) : Infinity;
        bs.splice(left <= right ? i : i + 1, 1);
      }
      const G = bs.slice(0, -1).map((_, k) => cell(bs, k)).filter(g => g.length);
      if (G.length && G.every(okG)) un = G;
    }
    const best = eq && (!un || eq.length >= un.length) ? eq : un;
    if (best) return { lots: best.map(g => g.map(Ti)), ok: true };
    return { lots: [row], ok: false };
  }
  /* طرق مقترحة داخل الجزء بعرض aRW. R0 بإحداثيات مدوّرة (الواجهة أسفل)، toLoc يعيد النقطة للإحداثيات المحلية.
     A = طرق متعامدة على الواجهة، B = طرق موازية + وصلة. تُرجع كل البدائل (بالإحداثيات المحلية) مع ميل كل منها. */
  function withRoads(R0, lowF, highF, dT, toLoc0) {
    let R = R0, flip = false;
    if (!lowF && highF) { R = R0.map(p => [-p[0], -p[1]]); flip = true; [lowF, highF] = [true, false]; }
    const toLoc = flip ? (p => toLoc0([-p[0], -p[1]])) : toLoc0;
    const bb = bboxOf(R), Wu = bb[2] - bb[0], H = bb[3] - bb[1], w = aRW, B = 1e6, cands = [];
    const slabU = (g, a, b) => clipHalf(clipHalf(g, 1, 0, -a), -1, 0, b), slabV = (g, a, b) => clipHalf(clipHalf(g, 0, 1, -a), 0, -1, b);
    const evalC = (roads, rows, how, lines) => cands.push(mkCand(R, roads, rows, how, lines, toLoc));
    const nA = Math.max(1, Math.round(Wu / (2 * dT + w)));
    for (const n of [nA - 1, nA, nA + 1]) {
      if (n < 1) continue; const d = (Wu - n * w) / (2 * n); if (d < 0.6 * dT || d < aW * 0.6) continue;
      const xs = []; for (let k = 0; k < n; k++) { const x1 = bb[0] + d + k * (2 * d + w); xs.push([x1, x1 + w]); }
      const roads = xs.map(([a, b]) => slabU(R, a, b)), bnd = [[-B, xs[0][0]]];
      for (let k = 0; k < n - 1; k++) { const m = (xs[k][1] + xs[k + 1][0]) / 2; bnd.push([xs[k][1], m], [m, xs[k + 1][0]]); }
      bnd.push([xs[n - 1][1], B]);
      evalC(roads, bnd.map(([a, b]) => ({ poly: slabU(R, a, b), ax: 1 })), n === 1 ? "طريق داخلي متعامد على الشارع" : n + " طرق متعامدة على الشارع",
        xs.map(([a, b]) => lineIn(R, [(a + b) / 2, bb[1] - 1], [0, 1])));
    }
    const nB = Math.max(1, Math.round(H / (2 * dT + w)));
    for (const m of [nB - 1, nB, nB + 1]) {
      if (m < 1) continue; const d = (H - m * w) / (2 * m); if (d < 0.6 * dT || d < aW * 0.6) continue;
      const ys = []; for (let k = 0; k < m; k++) { const y1 = bb[1] + d + k * (2 * d + w); ys.push([y1, y1 + w]); }
      const vEnd = highF ? bb[3] + 1 : ys[m - 1][1], lefts = [], rights = [];
      let okS = true;
      for (let t = 0; t <= 10; t++) { const v = bb[1] + 0.05 + (Math.min(vEnd, bb[3]) - bb[1] - 0.1) * t / 10, xs = []; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) xs.push(a[0] + (v - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } if (xs.length < 2) { okS = false; break; } lefts.push(Math.min(...xs)); rights.push(Math.max(...xs)); }
      if (!okS) continue;
      const uL = Math.max(...lefts), uR = Math.min(...rights);
      for (const side of ["L", "R", "LR"]) {
        if (uR - uL < (side === "LR" ? 2 : 1) * w + 2 * aW) continue;
        const cs = []; if (side.includes("L")) cs.push([uL, uL + w]); if (side.includes("R")) cs.push([uR - w, uR]);
        const roads = cs.map(([a, b]) => slabV(slabU(R, a, b), -B, vEnd));
        const gaps = []; let lo = -B; cs.forEach(([a, b]) => { gaps.push([lo, a]); lo = b; }); gaps.push([lo, B]);
        ys.forEach(([a, b]) => gaps.forEach(([x1, x2]) => roads.push(slabU(slabV(R, a, b), x1, x2))));
        const vb = [[-B, ys[0][0]]]; for (let k = 0; k < m - 1; k++) { const mm = (ys[k][1] + ys[k + 1][0]) / 2; vb.push([ys[k][1], mm], [mm, ys[k + 1][0]]); } vb.push([ys[m - 1][1], B]);
        const rows = [];
        vb.forEach(([a, b]) => { const band = slabV(R, a, b); if (!band.length) return; (a >= vEnd - 1e-9 ? [band] : gaps.map(([x1, x2]) => slabU(band, x1, x2))).forEach(g => rows.push({ poly: g, ax: 0 })); });
        const lines = ys.map(([a, b]) => lineIn(R, [bb[0] - 1, (a + b) / 2], [1, 0])).concat(cs.map(([a, b]) => lineIn(slabV(R, -B, vEnd), [(a + b) / 2, bb[1] - 1], [0, 1])));
        evalC(roads, rows, (m === 1 ? "طريق داخلي موازٍ للشارع" : m + " طرق موازية للشارع") + (side === "LR" ? " ووصلتان من الجانبين" : " ووصلة جانبية"), lines);
      }
    }
    return cands;
  }
  /* بديل حسب الميل: طرق موازية لخطوط الكنتور (شبه مستوية)، تربطها وصلة مائلة بزاوية تجعل ميلها ≤ الحد، تبدأ من الشارع القائم */
  function contourRoads(r, fe, dT) {
    const g = slopeOf(r); if (!g || g.S <= aSlope / 100 * 0.85) return [];
    const phi = Math.atan2(g.b, g.a) + Math.PI / 2, c = Math.cos(phi), s = Math.sin(phi), toLoc = p => unrot(p, c, s);
    const R = r.map(p => rot(p, c, s)), bb = bboxOf(R), H = bb[3] - bb[1], w = aRW, cands = [];
    const feR = fe.map(e => [rot(e.a, c, s), rot(e.b, c, s)]);
    const nearFront = p => feR.some(([a, b]) => distSeg(p, a, b) < w);
    const beta = Math.asin(Math.min(1, (aSlope / 100) * 0.85 / g.S));
    const nB = Math.max(1, Math.round(H / (2 * dT + w)));
    for (const m of [nB - 1, nB, nB + 1]) {
      if (m < 1) continue; const d = (H - m * w) / (2 * m); if (d < 0.6 * dT || d < aW * 0.6) continue;
      const ys = []; for (let k = 0; k < m; k++) { const y1 = bb[1] + d + k * (2 * d + w); ys.push([y1, y1 + w]); }
      for (const sg of [1, -1]) for (const fx of [0.2, 0.5, 0.8]) {
        const dir = [Math.cos(beta) * sg, Math.sin(beta)], nx = -dir[1], ny = dir[0];
        // نقطة الوصلة على الحافة الدنيا أو العليا (أيهما على الشارع)
        const x0 = bb[0] + (bb[2] - bb[0]) * fx, p0 = [x0, (bb[1] + bb[3]) / 2], c0 = nx * p0[0] + ny * p0[1];
        const cl = lineIn(R, [p0[0] - dir[0] * 1e4, p0[1] - dir[1] * 1e4], dir);
        if (cl.length < 2) continue;
        if (feR.length && !nearFront(cl[0]) && !nearFront(cl[cl.length - 1]) && !ys.some(([a, b]) => { const l = lineIn(R, [bb[0] - 1, (a + b) / 2], [1, 0]); return l.length && (nearFront(l[0]) || nearFront(l[l.length - 1])); })) continue;
        const side = (G, lo, hi) => { let o = G; if (lo != null) o = clipHalf(o, nx, ny, -(c0 + lo)); if (hi != null && o.length) o = clipHalf(o, -nx, -ny, c0 + hi); return o; };
        const roads = [side(R, -w / 2, w / 2)], rows = [];
        ys.forEach(([a, b]) => { const band = clipHalf(clipHalf(R, 0, 1, -a), 0, -1, b); roads.push(side(band, null, -w / 2), side(band, w / 2, null)); });
        const vb = [[-1e6, ys[0][0]]]; for (let k = 0; k < m - 1; k++) { const mm = (ys[k][1] + ys[k + 1][0]) / 2; vb.push([ys[k][1], mm], [mm, ys[k + 1][0]]); } vb.push([ys[m - 1][1], 1e6]);
        vb.forEach(([a, b]) => { const band = clipHalf(clipHalf(R, 0, 1, -a), 0, -1, b); if (!band.length) return; [side(band, null, -w / 2), side(band, w / 2, null)].forEach(q => rows.push({ poly: q, ax: 0 })); });
        const lines = ys.map(([a, b]) => lineIn(R, [bb[0] - 1, (a + b) / 2], [1, 0])).concat([cl]);
        cands.push(mkCand(R, roads, rows, (m === 1 ? "طريق موازٍ للكنتور" : m + " طرق موازية للكنتور") + " ووصلة مائلة حسب الميل", lines, toLoc));
      }
    }
    return cands;
  }
  function mkCand(R, roads, rows, how, lines, toLoc) {
    const lots = [], rest = []; let bad = 0;
    rows.forEach(rw => { if (!rw.poly.length) return; if (Math.abs(ringArea(rw.poly)) < tgtA() - 0.01) { rest.push(rw.poly); return; } const k = cutRow(rw.poly, rw.ax); if (!k.ok) { rest.push(rw.poly); bad++; } else { lots.push(...k.lots); rest.push(...(k.rest || [])); } });
    const RD = roads.filter(g => g.length > 2 && Math.abs(ringArea(g)) > 0.5), L = q => q.map(toLoc);
    const out = { lots: lots.map(L), rest: rest.map(L), roads: RD.map(L), ra: RD.reduce((t, g) => t + Math.abs(ringArea(g)), 0), bad, how, g: null };
    if (slopeReady()) out.g = Math.max(0, ...lines.filter(l => l.length > 1).map(l => gradeOf(l.map(toLoc))));
    return out;
  }
  /* نقاط خط مستقيم (يبدأ من p باتجاه d) داخل المضلع R، كل 2 م */
  function lineIn(R, p, d) {
    const out = [], bb = bboxOf(R), L = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) + 2e4;
    let t0 = 0; const dl = Math.hypot(d[0], d[1]), u = [d[0] / dl, d[1] / dl];
    // ابدأ من أقرب نقطة للمضلع
    const proj = q => (q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1];
    const ts = R.map(proj); const a = Math.min(...ts) - 1, b = Math.max(...ts) + 1;
    for (let t = Math.max(t0, a); t <= Math.min(L, b); t += 2) { const q = [p[0] + u[0] * t, p[1] + u[1] * t]; if (inRing(q, R)) out.push(q); else if (out.length) break; }
    return out;
  }
  function doAutoAll() {
    aDef(); const PL = parcelsL(); let n = 0, bad = 0; const next = [], newRoads = [];
    D.parcels.forEach((x, i) => {
      if (x.t !== "block") { next.push(x); return; }
      const keep = dirIdx; dirIdx = 0; const r = autoLots(PL[i]); dirIdx = keep;
      if (!r.lots.length) { next.push(x); return; }
      bad += r.bad; n += r.lots.length; r.lots.forEach(g => next.push({ P: [g.map(toW)], t: "res" }));
      (r.rest || []).forEach(g => next.push({ P: [g.map(toW)], t: "block" })); (r.roads || []).forEach(g => newRoads.push(g.map(toW)));
    });
    if (!n) { toast("لا توجد بلوكات غير مقسمة"); return; }
    snap(); D.parcels = next; if (newRoads.length) { D.rp = (D.rp || []).concat(newRoads); rebuild(true); } sel = -1; saveD(); panel(); draw();
    toast(`أُفرزت البلوكات إلى ${n} قسيمة (${aEx > 0 ? "مساحة النمرة " + aEx : "أقل مساحة " + aMin} م²، أقل عرض ${aW} م)` + (bad ? ` — ${bad} جزء لم يتسع للشروط فبقي قطعة واحدة` : ""));
  }
  function doGrid() {
    if (sel < 0) return;
    if (gMode === "auto") {
      const r = autoLots(parcelsL()[sel]); if (!r.lots.length) { toast("تعذّر الإفراز"); return; }
      snap(); const t = D.parcels[sel].t === "block" ? "res" : D.parcels[sel].t;
      D.parcels.splice(sel, 1, ...r.lots.map(g => ({ P: [g.map(toW)], t })), ...(r.rest || []).map(g => ({ P: [g.map(toW)], t: "block" })));
      if (r.roads && r.roads.length) { D.rp = (D.rp || []).concat(r.roads.map(g => g.map(toW))); rebuild(true); }
      sel = -1; saveD(); panel(); draw();
      if (r.roads && r.roads.length) { toast(`أُفرز إلى ${r.lots.length} قسيمة مع ${r.how} بعرض ${aRW} م (${fmt(r.ra)} م²)` + (r.g != null ? `، أقصى ميل ${(r.g * 100).toFixed(1)}%` : "") + (r.rest.length ? `، وبقيت ${r.rest.length} قطعة صغيرة غير مقسمة` : "")); return; }
      toast(r.bad ? "الجزء لا يتسع لقسيمة بهذه الشروط" : `أُفرز إلى ${r.lots.length} قسيمة متساوية` + (r.front ? "، واجهتها على الشارع" : "")); return;
    }
    const P = parcelsL()[sel], out = [];
    gridCells(P).forEach(cell => { const r = clipConvex(P[0], cell); if (r.length && Math.abs(ringArea(r)) > 0.3) out.push([r]); });
    if (!out.length) { toast("تعذّر التقسيم"); return; }
    snap();
    const t = D.parcels[sel].t === "block" ? "res" : D.parcels[sel].t;
    D.parcels.splice(sel, 1, ...out.map(q => ({ P: q.map(r => r.map(toW)), t })));
    sel = -1; saveD(); panel(); draw(); toast("قُسّمت إلى " + out.length + " قطع");
  }
  function doSplit(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.5) return;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, BIG = 1e5;
    const half = sgn => [[[a[0] - ux * BIG, a[1] - uy * BIG], [a[0] + ux * BIG, a[1] + uy * BIG], [a[0] + ux * BIG + nx * BIG * sgn, a[1] + uy * BIG + ny * BIG * sgn], [a[0] - ux * BIG + nx * BIG * sgn, a[1] - uy * BIG + ny * BIG * sgn], [a[0] - ux * BIG, a[1] - uy * BIG]]];
    const PL = parcelsL(); let changedAny = false; const next = [];
    // only parcels that the drawn segment actually crosses
    PL.forEach((P, i) => {
      const crosses = segHits(P, a, b);
      if (!crosses) { next.push(D.parcels[i]); return; }
      const c0 = -(nx * a[0] + ny * a[1]), A = clipHalf(P[0], nx, ny, c0), B = clipHalf(P[0], -nx, -ny, -c0);
      if (!A.length || !B.length || Math.abs(ringArea(A)) < 0.3 || Math.abs(ringArea(B)) < 0.3) { next.push(D.parcels[i]); return; }
      changedAny = true; [A, B].forEach(r => next.push({ P: [r.map(toW)], t: D.parcels[i].t }));
    });
    if (!changedAny) { toast("الخط لا يقطع أي قطعة بالكامل"); return; }
    snap(); D.parcels = next; sel = -1; saveD(); panel(); draw();
  }
  function segHits(P, a, b) {   // هل القطعة الواصلة بين النقطتين تعبر حدود القطعة مرتين على الأقل
    let n = 0;
    P.forEach(r => { for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (segX(a, b, p, q)) n++; } });
    return n >= 2;
  }
  function segX(a, b, c, d) { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b); return d1 * d2 < 0 && d3 * d4 < 0; }
  function doMerge(i, j) {
    const PL = parcelsL(), u = fromMP(safePC("union", closeP(PL[i]), closeP(PL[j])) || []);
    if (u.length !== 1) { toast("القطعتان غير متجاورتين"); return; }
    snap(); const t = D.parcels[i].t; D.parcels.splice(Math.max(i, j), 1); D.parcels.splice(Math.min(i, j), 1, { P: u[0].map(r => r.map(toW)), t }); sel = -1; mergeA = -1; saveD(); panel(); draw(); toast("دُمجت القطعتان");
  }

  /* ---------- الترقيم والجدول ---------- */
  function numbering() {
    const PL = parcelsL(), idx = D.parcels.map((x, i) => i).filter(i => D.parcels[i].t === "res");
    const cs = idx.map(i => ({ i, c: centroidP(PL[i]) }));
    const H = 14;   // صفوف تقريبية من الشمال للجنوب، ومن اليمين لليسار
    cs.sort((p, q) => Math.round(-p.c[1] / H) - Math.round(-q.c[1] / H) || q.c[0] - p.c[0]);
    const m = {}; cs.forEach((x, k) => m[x.i] = k + 1); return m;
  }
  let NUM = {};
  const numOf = i => NUM[i] || "";
  function tableRows() {
    const PL = parcelsL(); NUM = numbering();
    const rows = D.parcels.map((x, i) => ({ i, no: x.t === "res" ? NUM[i] : "—", type: TYPES[x.t].n, a: polyArea(PL[i]), t: x.t }));
    rows.sort((a, b) => (a.t === "res" ? 0 : 1) - (b.t === "res" ? 0 : 1) || (a.no === "—" ? 1e9 : a.no) - (b.no === "—" ? 1e9 : b.no));
    return rows;
  }
  function stats() {
    const T = polyArea(land), R = fromMP(roadsMP).reduce((t, P) => t + polyArea(P), 0), PL = parcelsL(), by = {};
    D.parcels.forEach((x, i) => { (by[x.t] = by[x.t] || { n: 0, a: 0 }); by[x.t].n++; by[x.t].a += polyArea(PL[i]); });
    return { T, R, by };
  }

  /* ---------- الرسم والتحريك ---------- */
  let V = null;   // {cx, cy, k}  مركز العرض بالإحداثيات المحلية والتكبير (بكسل/متر)
  function fitView() { const el = $i("dzMap"), bb = bboxOf(land[0]), w = el.clientWidth, h = el.clientHeight; const k = Math.min(w / ((bb[2] - bb[0]) * 1.25), h / ((bb[3] - bb[1]) * 1.25)); V = { cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, k }; }
  const sx = x => (x - V.cx) * V.k + $i("dzMap").clientWidth / 2, sy = y => (V.cy - y) * V.k + $i("dzMap").clientHeight / 2;
  const wx = X => (X - $i("dzMap").clientWidth / 2) / V.k + V.cx, wy = Y => V.cy - (Y - $i("dzMap").clientHeight / 2) / V.k;
  const path = P => P.map(r => "M" + r.map(p => sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1)).join("L") + "Z").join("");
  let raf = 0; const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawNow); };
  function drawNow() {
    if (!D || !land) return;
    const svg = $i("dzSvg"); let h = "";
    const A = aerial(S.boundary, draw);
    if (A) { const x0 = sx(A.box[0] - O[0]), y0 = sy(A.box[3] - O[1]), x1 = sx(A.box[2] - O[0]), y1 = sy(A.box[1] - O[1]); h += `<image href="${A.url}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" preserveAspectRatio="none"/>`; }
    else h += `<text x="50%" y="40" fill="#cfe0d4" font-size="13" text-anchor="middle">${sysOf(S.boundary) ? "…جاري تحميل الصورة الجوية" : "الإحداثيات ليست بنظام فلسطيني أو ITM — لا توجد صورة جوية"}</text>`;
    const PL = parcelsL(); NUM = numbering();
    if (aSlopeOn && CT.st === "ok") CT.lines.forEach(L => { const major = Math.abs(L.z / 5 - Math.round(L.z / 5)) < 1e-6; L.paths.forEach(pp => h += `<polyline points="${pp.map(q => sx(q[0]).toFixed(1) + "," + sy(q[1]).toFixed(1)).join(" ")}" fill="none" stroke="${major ? "rgba(255,170,90,.9)" : "rgba(255,190,120,.45)"}" stroke-width="${major ? 1.3 : 0.7}"/>`); });
    fromMP(roadsMP).forEach(P => h += `<path d="${path(P)}" fill="rgba(70,70,70,.72)" stroke="#f5f5f5" stroke-width="1.2" stroke-dasharray="6 4" fill-rule="evenodd"/>`);
    PL.forEach((P, i) => { const ty = TYPES[D.parcels[i].t]; h += `<path d="${path(P)}" fill="${ty.f}" stroke="${i === sel || i === mergeA ? "#ff3b30" : ty.s}" stroke-width="${i === sel || i === mergeA ? 3.5 : 1.6}" fill-rule="evenodd"/>`; });
    if (tool === "grid" && sel >= 0 && gMode === "auto") { const ar = autoLots(PL[sel]); (ar.roads || []).forEach(g => h += `<path d="${path([g])}" fill="${ar.g != null && ar.g > aSlope / 100 + 1e-9 ? "rgba(200,40,30,.6)" : "rgba(60,60,60,.7)"}" stroke="#fff" stroke-width="1.2" stroke-dasharray="6 4"/>`); (ar.rest || []).forEach(g => h += `<path d="${path([g])}" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="1"/>`); ar.lots.forEach(g => h += `<path d="${path([g])}" fill="none" stroke="${ar.bad ? "#ff6b5b" : "#fff"}" stroke-width="1.6" stroke-dasharray="5 3"/>`); }
    else if (tool === "grid" && sel >= 0) gridCells(PL[sel]).forEach(c => { const r = clipConvex(PL[sel][0], c); if (r.length) h += `<path d="${path([r])}" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="5 3"/>`; });
    h += `<path d="${path(land)}" fill="none" stroke="#ffe066" stroke-width="3" stroke-linejoin="round"/>`;
    land[0].forEach(p => h += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="4" fill="#ffe066" stroke="#7a5a00"/>`);
    // labels
    const fs = Math.max(9, Math.min(16, V.k * 3.2));
    PL.forEach((P, i) => {
      const a = polyArea(P); if (a * V.k * V.k < 900) return;
      const c = labelPt(P), x = sx(c[0]), y = sy(c[1]), t = D.parcels[i].t;
      const top = t === "res" ? NUM[i] : TYPES[t].n;
      h += `<text x="${x}" y="${y - fs * .35}" fill="#fff" stroke="rgba(0,0,0,.65)" stroke-width="3" paint-order="stroke" font-size="${fs * 1.15}" font-weight="700" text-anchor="middle">${top}</text>`;
      h += `<text x="${x}" y="${y + fs * .85}" fill="#fff" stroke="rgba(0,0,0,.65)" stroke-width="3" paint-order="stroke" font-size="${fs * .8}" text-anchor="middle" direction="ltr">${fmt(a)} م²</text>`;
    });
    if (tool === "road" && draft.length) {
      const prev = roadPoly(draft, D.w || 8); fromMP(prev).forEach(P => h += `<path d="${path(P)}" fill="rgba(255,255,255,.35)" stroke="#fff" stroke-width="1.5"/>`);
      h += `<polyline points="${draft.map(p => sx(p[0]) + "," + sy(p[1])).join(" ")}" fill="none" stroke="#ff3b30" stroke-width="2.5"/>`;
      draft.forEach(p => h += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="5" fill="#ff3b30" stroke="#fff" stroke-width="2"/>`);
    }
    if (tool === "road" && rmode === "edit" && D.roads[rsel]) {
      const R = D.roads[rsel], pl = R.pts.map(toL);
      fromMP(roadPoly(pl, R.w)).forEach(P => h += `<path d="${path(P)}" fill="rgba(255,59,48,.25)" stroke="#ff3b30" stroke-width="2"/>`);
      h += `<polyline points="${pl.map(p => sx(p[0]) + "," + sy(p[1])).join(" ")}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 4"/>`;
      pl.forEach(p => h += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="9" fill="#fff" stroke="#ff3b30" stroke-width="3"/>`);
    }
    if (tool === "split" && draft.length === 1) h += `<circle cx="${sx(draft[0][0])}" cy="${sy(draft[0][1])}" r="6" fill="#ff3b30" stroke="#fff" stroke-width="2"/>`;
    svg.innerHTML = h;
    const s = stats(), res = s.by.res || { n: 0, a: 0 };
    $i("dzStats").innerHTML = `<span>الأرض <b>${fmt(s.T)}</b> م²</span><span>الشوارع <b>${fmt(s.R)}</b> م² (<b>${(s.R / s.T * 100 || 0).toFixed(1)}%</b>)</span><span>قسائم سكنية <b>${res.n}</b> · <b>${fmt(res.a)}</b> م²</span>` +
      (s.by.green ? `<span>خضراء <b>${fmt(s.by.green.a)}</b></span>` : "") + (s.by.pub ? `<span>مرافق <b>${fmt(s.by.pub.a)}</b></span>` : "") + (s.by.block ? `<span>غير مقسّم <b>${s.by.block.n}</b></span>` : "");
  }
  function snapPt(p) {   // التقاط رؤوس الحدود ونقاط الشوارع القريبة
    const tol = 14 / V.k; let best = null, bd = tol;
    land[0].concat(...D.roads.map(r => r.pts.map(toL))).forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } });
    return best ? [best[0], best[1]] : p;
  }
  function tap(X, Y) {
    const p = [wx(X), wy(Y)], PL = parcelsL(), hit = PL.findIndex(P => inPoly(p, P));
    if (tool === "road") {
      if (rmode === "free") { draft.push(snapPt(p)); panel(); draw(); return; }
      if (rmode === "edit") { rsel = D.roads.findIndex(R => fromMP(roadPoly(R.pts.map(toL), Math.max(R.w, 16 / V.k))).some(P => inPoly(p, P))); panel(); draw(); return; }
      edgeRoad(p); return;
    }
    if (tool === "split") { const q = snapPt(p); if (!draft.length) { draft = [q]; draw(); } else { const a = draft[0]; draft = []; doSplit(a, q); draw(); } return; }
    if (tool === "merge") { if (hit < 0) return; if (mergeA < 0 || mergeA === hit) { mergeA = hit; draw(); } else doMerge(mergeA, hit); return; }
    sel = hit; dirIdx = 0; panel(); draw();
  }
  function initPointer() {
    const el = $i("dzMap"), pts = new Map(); let start = null, moved = false, pinch = null;
    let drag = null;
    el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pts.size === 1 && tool === "road" && rmode === "edit" && D.roads[rsel]) { const vi = D.roads[rsel].pts.findIndex(q => { const l = toL(q); return Math.hypot(sx(l[0]) - e.offsetX, sy(l[1]) - e.offsetY) < 24; }); if (vi >= 0) { snap(); drag = vi; start = null; moved = true; return; } }
      if (pts.size === 1) { start = { x: e.offsetX, y: e.offsetY, cx: V.cx, cy: V.cy }; moved = false; } else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: V.k, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w: [wx((a[0] + b[0]) / 2), wy((a[1] + b[1]) / 2)] }; moved = true; } });
    el.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (drag != null && D.roads[rsel]) { D.roads[rsel].pts[drag] = toW([wx(e.offsetX), wy(e.offsetY)]); draw(); return; }
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); V.k = Math.max(0.05, Math.min(60, pinch.k * d / pinch.d)); const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; V.cx = pinch.w[0] - (m[0] - el.clientWidth / 2) / V.k; V.cy = pinch.w[1] + (m[1] - el.clientHeight / 2) / V.k; draw(); return; }
      if (start && pts.size === 1) { const dx = e.offsetX - start.x, dy = e.offsetY - start.y; if (Math.hypot(dx, dy) > 8) moved = true; if (moved) { V.cx = start.cx - dx / V.k; V.cy = start.cy + dy / V.k; draw(); } }
    });
    const up = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (drag != null) { drag = null; rebuild(false); sel = -1; saveD(); panel(); draw(); toast("تعدّل مسار الشارع وأُعيد حساب البلوكات"); start = null; return; } if (pts.size < 2) pinch = null; if (!pts.size) { if (!moved && start) tap(e.offsetX, e.offsetY); start = null; } };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", e => { e.preventDefault(); const w = [wx(e.offsetX), wy(e.offsetY)]; V.k = Math.max(0.05, Math.min(60, V.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); V.cx = w[0] - (e.offsetX - el.clientWidth / 2) / V.k; V.cy = w[1] + (e.offsetY - el.clientHeight / 2) / V.k; draw(); }, { passive: false });
    addEventListener("resize", () => { if (!$i("dz").hidden) draw(); });
  }

  /* ---------- التصدير ---------- */
  function exportDXF() {
    const L = []; const add = (...a) => L.push(...a.map(String));
    add(0, "SECTION", 2, "ENTITIES");
    const pl = (pts, layer, col) => { add(0, "LWPOLYLINE", 8, layer, 62, col, 90, pts.length, 70, 1); pts.forEach(p => add(10, p[0].toFixed(3), 20, p[1].toFixed(3))); };
    const tx = (p, t, h, layer) => add(0, "TEXT", 8, layer, 10, p[0].toFixed(3), 20, p[1].toFixed(3), 30, 0, 40, h, 1, t, 72, 1, 11, p[0].toFixed(3), 21, p[1].toFixed(3), 31, 0);
    pl(S.boundary, "BOUNDARY", 2);
    fromMP(roadsMP).forEach(P => P.forEach(r => pl(r.map(toW), "ROADS", 8)));
    const PL = parcelsL(); NUM = numbering();
    const LAY = { res: ["LOTS", 30], com: ["COMMERCIAL", 5], green: ["GREEN", 3], pub: ["PUBLIC", 6], block: ["UNDIVIDED", 7] };
    PL.forEach((P, i) => { const t = D.parcels[i].t, [ly, c] = LAY[t]; P.forEach(r => pl(r.map(toW), ly, c)); const lp = toW(labelPt(P)); tx(lp, t === "res" ? String(NUM[i]) : TYPES[t].n, 2.2, "LABELS"); tx([lp[0], lp[1] - 3], fmt(polyArea(P)) + " m2", 1.4, "LABELS"); });
    add(0, "ENDSEC", 0, "EOF");
    saveFile("ifraz-design-" + new Date().toISOString().slice(0, 10) + ".dxf", new Blob([L.join("\n")], { type: "application/dxf" }));
  }
  async function exportPDF() {
    if (!window.jspdf) { try { await loadScript("../jspdf.umd.min.js"); } catch (e) {} }
    if (!window.jspdf) { toast("تعذّر تحميل مكتبة PDF"); return; }
    const W = 2480, H = 3508, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    g.fillStyle = "#fbfcfa"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#0c3b26"; g.fillRect(0, 0, W, 260); g.fillStyle = "#c99a2e"; g.fillRect(0, 260, W, 10);
    g.direction = "rtl"; g.textAlign = "right"; g.fillStyle = "#f3dc93"; g.font = "700 96px 'Reem Kufi','IBM Plex Sans Arabic',sans-serif"; g.fillText("مخطط إفراز مقترح", W - 120, 150);
    g.font = "500 52px 'IBM Plex Sans Arabic',sans-serif"; g.fillStyle = "#fff6d6"; g.fillText((S.landTitle || "") + (S.surveyor ? "   ·   " + S.surveyor : ""), W - 120, 225);
    g.textAlign = "left"; g.fillStyle = "#f3dc93"; g.font = "700 60px 'Reem Kufi',sans-serif"; g.fillText("المهندس إسلام", 120, 150);
    // map area
    const mx = 120, my = 330, mw = W - 240, mh = 1900, bb = bboxOf(land[0]), k = Math.min(mw / ((bb[2] - bb[0]) * 1.15), mh / ((bb[3] - bb[1]) * 1.15));
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, X = x => mx + mw / 2 + (x - cx) * k, Y = y => my + mh / 2 - (y - cy) * k;
    g.save(); g.beginPath(); g.rect(mx, my, mw, mh); g.clip(); g.fillStyle = "#dfe6dc"; g.fillRect(mx, my, mw, mh);
    const A = AER && AER.ready ? AER : null;
    if (A) g.drawImage(A.img, X(A.box[0] - O[0]), Y(A.box[3] - O[1]), (A.box[2] - A.box[0]) * k, (A.box[3] - A.box[1]) * k);
    const fillP = (P, f, s, lw, dash) => { g.beginPath(); P.forEach(r => r.forEach((p, i) => g[i ? "lineTo" : "moveTo"](X(p[0]), Y(p[1])))); g.closePath(); if (f) { g.fillStyle = f; g.fill("evenodd"); } if (s) { g.setLineDash(dash || []); g.strokeStyle = s; g.lineWidth = lw; g.stroke(); g.setLineDash([]); } };
    fromMP(roadsMP).forEach(P => fillP(P, "rgba(70,70,70,.75)", "#fff", 3, [18, 12]));
    const PL = parcelsL(); NUM = numbering();
    PL.forEach((P, i) => { const t = TYPES[D.parcels[i].t]; fillP(P, t.f, t.s, 4); });
    fillP(land, null, "#ffe066", 9);
    g.textAlign = "center"; g.direction = "ltr";
    PL.forEach((P, i) => { const a = polyArea(P); if (a * k * k < 6000) return; const lp = labelPt(P), x = X(lp[0]), y = Y(lp[1]), t = D.parcels[i].t, fs = Math.max(26, Math.min(64, Math.sqrt(a) * k * 0.22));
      g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,.6)"; g.fillStyle = "#fff"; g.font = `700 ${fs}px 'IBM Plex Sans Arabic',sans-serif`; g.direction = "rtl";
      const top = t === "res" ? String(NUM[i]) : TYPES[t].n; g.strokeText(top, x, y); g.fillText(top, x, y);
      g.font = `600 ${fs * .62}px 'IBM Plex Sans Arabic',sans-serif`; const s2 = fmt(a) + " م²"; g.strokeText(s2, x, y + fs * .85); g.fillText(s2, x, y + fs * .85); });
    g.restore(); g.strokeStyle = "#0c3b26"; g.lineWidth = 6; g.strokeRect(mx, my, mw, mh);
    // north arrow
    g.save(); g.translate(mx + 110, my + 130); g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(0, 0, 70, 0, 7); g.fill(); g.fillStyle = "#0c3b26"; g.beginPath(); g.moveTo(0, -55); g.lineTo(26, 35); g.lineTo(0, 18); g.lineTo(-26, 35); g.closePath(); g.fill(); g.font = "700 40px sans-serif"; g.textAlign = "center"; g.fillText("N", 0, -78); g.restore();
    // table
    const s = stats(), rows = tableRows(); let y = my + mh + 90;
    g.direction = "rtl"; g.textAlign = "right"; g.fillStyle = "#0c3b26"; g.font = "700 54px 'Reem Kufi',sans-serif"; g.fillText("ملخص التصميم", W - 120, y); y += 70;
    g.font = "500 44px 'IBM Plex Sans Arabic',sans-serif"; g.fillStyle = "#1d2a22";
    const res = s.by.res || { n: 0, a: 0 };
    [["مساحة الأرض", fmt(s.T) + " م²"], ["الشوارع", fmt(s.R) + " م²  (" + (s.R / s.T * 100 || 0).toFixed(1) + "%)"], ["القسائم السكنية", res.n + " قسيمة  ·  " + fmt(res.a) + " م²"]].concat(
      Object.entries(s.by).filter(([k]) => k !== "res").map(([k, v]) => [TYPES[k].n, v.n + "  ·  " + fmt(v.a) + " م²"])).forEach(([a, b]) => { g.fillText(a + ":  " + b, W - 120, y); y += 58; });
    y += 30; g.font = "700 46px 'IBM Plex Sans Arabic',sans-serif"; g.fillText("جدول القسائم", W - 120, y); y += 20;
    const cols = 4, cw = (W - 240) / cols, list = rows.filter(r => r.t === "res"), perCol = Math.ceil(list.length / cols);
    g.font = "500 36px 'IBM Plex Sans Arabic',sans-serif";
    list.forEach((r, i) => { const col = Math.floor(i / Math.max(1, perCol)), row = i % Math.max(1, perCol), xr = W - 120 - col * cw, yy = y + 50 + row * 46; if (yy > H - 120) return; g.fillText("قسيمة " + r.no + ":  " + fmt(r.a) + " م²", xr, yy); });
    g.font = "500 30px 'IBM Plex Sans Arabic',sans-serif"; g.fillStyle = "#5b6a60"; g.fillText("مخطط استرشادي — الصورة الجوية من جيومولج", W - 120, H - 60);
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "mm", format: "a4", compress: true }); doc.addImage(c.toDataURL("image/jpeg", .9), "JPEG", 0, 0, 210, 297);
    saveFile("ifraz-design-" + new Date().toISOString().slice(0, 10) + ".pdf", doc.output("blob"));
  }

  /* ---------- فتح وإغلاق ---------- */
  let prevBack = null;
  function open(imp) {
    if (!S.boundary || S.boundary.length < 3) { toast("حمّل حدود الأرض أولاً (DXF أو إحداثيات)"); return; }
    if (!window.polygonClipping) { toast("…لحظة، جاري تحميل أدوات الهندسة"); return; }
    build(); loadD();
    if (imp && imp.parcels) {   // فتح مقترح من الإفراز الذكي للتعديل اليدوي
      D = { b: bKey(), roads: [], rp: imp.roads || [], parcels: imp.parcels.map(x => ({ P: [x.ring], t: x.t })), w: D.w || 8 };
      saveD(); setTimeout(() => toast("فُتح المقترح للتعديل: اختر قسيمة لتغيير نوعها، أو قسّم/ادمج، أو أضف شارعاً"), 400);
    }
    rebuild(true); undo = []; sel = -1; draft = [];
    $i("dz").hidden = false; document.body.style.overflow = "hidden"; $i("dzYear").value = aerYear;
    requestAnimationFrame(() => { fitView(); setTool("pan"); aerial(S.boundary, draw); });
    prevBack = window.__back; window.__back = () => { if (tool === "road" && draft.length) { draft = []; panel(); draw(); return 1; } if (sel >= 0) { sel = -1; panel(); draw(); return 1; } close(); return 1; };
  }
  function close() { $i("dz").hidden = true; document.body.style.overflow = ""; window.__back = prevBack; if (typeof renderLand === "function") renderLand(); }
  window.ifzDesign = open;
})();
