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
  const snap = () => { undo.push(JSON.stringify({ roads: D.roads, parcels: D.parcels })); if (undo.length > 60) undo.shift(); };
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
      if (b.dataset.a === "undo") { const u = undo.pop(); if (!u) { toast("لا يوجد ما يُتراجع عنه"); return; } const o = JSON.parse(u); D.roads = o.roads; D.parcels = o.parcels; sel = -1; rebuild(true); saveD(); draw(); panel(); }
      if (b.dataset.a === "more") { tool = "more"; sel = -1; draft = []; panel(); draw(); }
    });
    initPointer();
  }
  function setTool(t) {
    tool = t; draft = []; mergeA = -1; if (t !== "grid" && t !== "pan") sel = -1;
    document.querySelectorAll("#dzTools [data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    panel(); draw();
  }
  const HINT = { pan: "اضغط على أي قطعة لاختيارها وتغيير نوعها. اسحب لتحريك الصورة، وبإصبعين للتكبير.", road: "اضغط نقاط مسار الشارع على الصورة (يمكن أن يبدأ من خارج الأرض)، ثم «إنهاء الشارع».", grid: "اضغط على بلوك أو قطعة لتقسيمها شبكة.", split: "اضغط نقطتين لرسم خط يقسم القطعة التي يمر بها.", merge: "اضغط قطعتين متجاورتين لدمجهما.", more: "" };

  /* ---------- اللوحة السفلية حسب الأداة ---------- */
  let gR = 1, gC = 4, gMode = "count", gW = 20, gDp = 30;
  function panel() {
    const p = $i("dzPanel"); let h = "";
    if (tool === "road") h = `<div class="r"><span class="ttl">🛣️ شارع جديد</span><label>العرض (م)<input id="dzRW" type="number" min="2" step="0.5" value="${D.w || 8}"></label><span style="font-size:12.5px;color:#cfe0d4">${draft.length} نقاط</span></div>
      <div class="r"><button class="pb go" type="button" id="dzRDone">✓ إنهاء الشارع</button><button class="pb" type="button" id="dzRBack">↶ نقطة</button><button class="pb" type="button" id="dzRCancel">إلغاء</button>${D.roads.length ? `<button class="pb" type="button" id="dzRDel">🗑 حذف آخر شارع</button>` : ""}</div>`;
    else if (tool === "grid") {
      if (sel < 0) h = `<div class="r"><span class="ttl">▦ اضغط على البلوك الذي تريد تقسيمه</span></div>`;
      else h = `<div class="r"><span class="ttl">▦ تقسيم القطعة (${fmt(polyArea(parcelsL()[sel]))} م²)</span></div>
        <div class="r"><button class="pb ${gMode === "count" ? "go" : ""}" type="button" data-gm="count">بالعدد</button><button class="pb ${gMode === "size" ? "go" : ""}" type="button" data-gm="size">بالأبعاد</button>
        ${gMode === "count" ? `<label>صفوف<input id="dzGR" type="number" min="1" value="${gR}"></label><label>أعمدة<input id="dzGC" type="number" min="1" value="${gC}"></label>` : `<label>الواجهة (م)<input id="dzGW" type="number" min="3" step="0.5" value="${gW}"></label><label>العمق (م)<input id="dzGD" type="number" min="3" step="0.5" value="${gDp}"></label>`}</div>
        <div class="r"><button class="pb" type="button" id="dzGDir">🔄 تدوير الاتجاه</button><button class="pb go" type="button" id="dzGGo">✓ قسّم</button></div>`;
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
    on("dzGDir", () => { dirIdx++; draw(); }); on("dzGGo", doGrid);
    p.querySelectorAll("[data-ty]").forEach(b => b.onclick = () => { snap(); D.parcels[sel].t = b.dataset.ty; saveD(); panel(); draw(); });
    on("dzPdf", exportPDF); on("dzDxf", exportDXF);
    on("dzAllRes", () => { snap(); D.parcels.forEach(x => { if (x.t === "block") x.t = "res"; }); saveD(); panel(); draw(); });
    on("dzReset", () => { if (!confirmTwice()) return; snap(); D.roads = []; D.rp = []; rebuild(false); sel = -1; saveD(); panel(); draw(); });
  }
  let askT = 0; const confirmTwice = () => { if (Date.now() - askT < 3000) { askT = 0; return true; } askT = Date.now(); toast("اضغط مرة ثانية للتأكيد"); return false; };

  /* ---------- العمليات ---------- */
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
  function doGrid() {
    if (sel < 0) return;
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
    fromMP(roadsMP).forEach(P => h += `<path d="${path(P)}" fill="rgba(70,70,70,.72)" stroke="#f5f5f5" stroke-width="1.2" stroke-dasharray="6 4" fill-rule="evenodd"/>`);
    PL.forEach((P, i) => { const ty = TYPES[D.parcels[i].t]; h += `<path d="${path(P)}" fill="${ty.f}" stroke="${i === sel || i === mergeA ? "#ff3b30" : ty.s}" stroke-width="${i === sel || i === mergeA ? 3.5 : 1.6}" fill-rule="evenodd"/>`; });
    if (tool === "grid" && sel >= 0) gridCells(PL[sel]).forEach(c => { const r = clipConvex(PL[sel][0], c); if (r.length) h += `<path d="${path([r])}" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="5 3"/>`; });
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
    if (tool === "road") { draft.push(snapPt(p)); panel(); draw(); return; }
    if (tool === "split") { const q = snapPt(p); if (!draft.length) { draft = [q]; draw(); } else { const a = draft[0]; draft = []; doSplit(a, q); draw(); } return; }
    if (tool === "merge") { if (hit < 0) return; if (mergeA < 0 || mergeA === hit) { mergeA = hit; draw(); } else doMerge(mergeA, hit); return; }
    sel = hit; dirIdx = 0; panel(); draw();
  }
  function initPointer() {
    const el = $i("dzMap"), pts = new Map(); let start = null, moved = false, pinch = null;
    el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); if (pts.size === 1) { start = { x: e.offsetX, y: e.offsetY, cx: V.cx, cy: V.cy }; moved = false; } else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: V.k, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w: [wx((a[0] + b[0]) / 2), wy((a[1] + b[1]) / 2)] }; moved = true; } });
    el.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); V.k = Math.max(0.05, Math.min(60, pinch.k * d / pinch.d)); const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; V.cx = pinch.w[0] - (m[0] - el.clientWidth / 2) / V.k; V.cy = pinch.w[1] + (m[1] - el.clientHeight / 2) / V.k; draw(); return; }
      if (start && pts.size === 1) { const dx = e.offsetX - start.x, dy = e.offsetY - start.y; if (Math.hypot(dx, dy) > 8) moved = true; if (moved) { V.cx = start.cx - dx / V.k; V.cy = start.cy + dy / V.k; draw(); } }
    });
    const up = e => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { if (!moved && start) tap(e.offsetX, e.offsetY); start = null; } };
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
