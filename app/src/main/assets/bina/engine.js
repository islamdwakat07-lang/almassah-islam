/* محرّك «تصميم البناء»: غلاف البناء بعد الارتدادات، اقتراح أشكال البناء، وخيارات الأعمدة.
   كل الحسابات بالأمتار وبإحداثيات ملف الأرض نفسها. */
(function (G) {
  "use strict";
  const EPS = 1e-9;

  /* ---------- أدوات هندسية ---------- */
  function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function ccw(r) { return ringArea(r) < 0 ? r.slice().reverse() : r.slice(); }
  function clean(r) {
    const o = [];
    for (const p of r) { const q = o[o.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) o.push([+p[0], +p[1]]); }
    if (o.length > 2 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) < 1e-4) o.pop();
    return o;
  }
  function pip(p, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function segX(a, b, c, d) {   // تقاطع حقيقي بين قطعتين
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
  }
  /* هل الشكل B كله داخل A؟ (رؤوسه داخل A ولا تتقاطع أضلاعهما) */
  function within(B, A) {
    for (const p of B) if (!pip(p, A)) return false;
    for (let i = 0; i < B.length; i++) { const a = B[i], b = B[(i + 1) % B.length];
      for (let j = 0; j < A.length; j++) if (segX(a, b, A[j], A[(j + 1) % A.length])) return false; }
    return true;
  }
  function circle(c, r, n) { const o = []; for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; o.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } return o; }

  /* ---------- غلاف البناء: الأرض ناقص شريط بعرض الارتداد حول كل ضلع ---------- */
  function envelope(P, dists) {
    const pc = G.polygonClipping; if (!pc) throw new Error("polygon-clipping");
    const cuts = [];
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length], d = +dists[i] || 0; if (d <= 0) return;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return;
      const nx = -(b[1] - a[1]) / L * d, ny = (b[0] - a[0]) / L * d;
      cuts.push([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]);
      [a, b].forEach(q => { const c = circle(q, d, 48); c.push(c[0]); cuts.push([c]); });
    });
    const base = [[...P.map(p => p.slice()), P[0].slice()]];
    let res = cuts.length ? pc.difference(base, ...cuts) : [base];
    let best = null, ba = 0;
    for (const poly of res) { const r = clean(poly[0]); const a = Math.abs(ringArea(r)); if (a > ba) { ba = a; best = r; } }
    return best ? { ring: ccw(best), area: ba, parts: res.length } : null;
  }

  /* ---------- الإطار المحلي: u على امتداد الشارع، v نحو داخل الأرض ---------- */
  function frame(P, i) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-d[1], d[0]];   // الأرض باتجاه اليسار لأن الحلقة عكس عقارب الساعة
    return { O: a, d, n,
      loc: p => [(p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1], (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]],
      wld: q => [a[0] + q[0] * d[0] + q[1] * n[0], a[1] + q[0] * d[1] + q[1] * n[1]] };
  }

  /* ---------- شبكة نقاط الغلاف (للبحث السريع) ---------- */
  function grid(envL, s) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of envL) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
    const nu = Math.floor((u1 - u0) / s) + 1, nv = Math.floor((v1 - v0) / s) + 1;
    const ins = new Uint8Array(nu * nv), S = new Int32Array((nu + 1) * (nv + 1));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) ins[j * nu + i] = pip([u0 + i * s, v0 + j * s], envL) ? 1 : 0;
    for (let j = 0; j < nv; j++) { let row = 0; for (let i = 0; i < nu; i++) { row += ins[j * nu + i]; S[(j + 1) * (nu + 1) + i + 1] = S[j * (nu + 1) + i + 1] + row; } }
    const sum = (i0, j0, i1, j1) => S[(j1 + 1) * (nu + 1) + i1 + 1] - S[j0 * (nu + 1) + i1 + 1] - S[(j1 + 1) * (nu + 1) + i0] + S[j0 * (nu + 1) + i0];
    return { u0, v0, u1, v1, s, nu, nv, ins, sum };
  }
  /* أفضل مكان لمستطيل (عدد نقاط) حسب التفضيل */
  function placeRect(g, ni, nj, pref) {
    const want = (ni + 1) * (nj + 1); let best = null;
    const cu = (g.nu - 1) / 2, cvv = (g.nv - 1) / 2;
    for (let j = 0; j + nj < g.nv; j++) for (let i = 0; i + ni < g.nu; i++) {
      if (g.sum(i, j, i + ni, j + nj) !== want) continue;
      const mu = i + ni / 2, mv = j + nj / 2;
      const sc = pref === "back" ? -mv * 1000 + Math.abs(mu - cu) : pref === "mid" ? Math.hypot(mu - cu, mv - cvv) * 1000 : mv * 1000 + Math.abs(mu - cu);
      if (!best || sc < best.sc) best = { i, j, sc };
    }
    return best;
  }
  /* مكان شكل عام (قائمة إزاحات نقاط داخله) */
  function placeShape(g, offs, ni, nj, pref, verify) {
    const cu = (g.nu - 1) / 2, cvv = (g.nv - 1) / 2, cand = [];
    for (let j = 0; j + nj < g.nv; j++) for (let i = 0; i + ni < g.nu; i++) {
      // اختبار سريع لزوايا الصندوق المحيط بالشكل أولاً غير ممكن (الشكل ليس مستطيلاً)، لذا نختبر النقاط
      let ok = true;
      for (let k = 0; k < offs.length; k += 2) { if (!g.ins[(j + offs[k + 1]) * g.nu + i + offs[k]]) { ok = false; break; } }
      if (!ok) continue;
      const mu = i + ni / 2, mv = j + nj / 2;
      cand.push({ i, j, sc: pref === "back" ? -mv * 1000 + Math.abs(mu - cu) : pref === "mid" ? Math.hypot(mu - cu, mv - cvv) * 1000 : mv * 1000 + Math.abs(mu - cu) });
    }
    cand.sort((a, b) => a.sc - b.sc);
    for (const c of cand.slice(0, 400)) if (!verify || verify(c)) return c;
    return null;
  }

  /* ---------- أشكال البناء (محلية، الزاوية الأمامية اليسرى عند 0,0) ---------- */
  function arcPts(cx, cy, r, t0, t1, n) { const o = []; for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return o; }
  const shapes = {
    rect: (w, h) => [[0, 0], [w, 0], [w, h], [0, h]],
    // مستطيل بزاويتين أماميتين مقوّستين
    roundFront: (w, h, R) => [...arcPts(R, R, R, Math.PI, 1.5 * Math.PI, 10), ...arcPts(w - R, R, R, 1.5 * Math.PI, 2 * Math.PI, 10), [w, h], [0, h]],
    // كل الزوايا مقوّسة
    roundAll: (w, h, R) => [...arcPts(R, R, R, Math.PI, 1.5 * Math.PI, 10), ...arcPts(w - R, R, R, 1.5 * Math.PI, 2 * Math.PI, 10), ...arcPts(w - R, h - R, R, 0, .5 * Math.PI, 10), ...arcPts(R, h - R, R, .5 * Math.PI, Math.PI, 10)],
    // واجهة أمامية مقوّسة باتجاه الشارع (سهم القوس f)
    bowFront: (w, h, f) => { const R = (w * w / 4 + f * f) / (2 * f), cy = f - R + 0, half = Math.asin(w / 2 / R);
      // مركز الدائرة على محور المنتصف، والقوس يبرز نحو v السالبة
      const cyc = -f + R; const pts = arcPts(w / 2, cyc, R, 1.5 * Math.PI - half, 1.5 * Math.PI + half, 24); pts[0] = [0, 0]; pts[pts.length - 1] = [w, 0];
      return [...pts, [w, h], [0, h]]; },
    // شكل L: عرض كامل في الأمام بعمق h1، والجزء الخلفي بعرض w2 على جهة side
    L: (w, h1, w2, h2, side) => side === "r" ? [[0, 0], [w, 0], [w, h1 + h2], [w - w2, h1 + h2], [w - w2, h1], [0, h1]] : [[0, 0], [w, 0], [w, h1], [w2, h1], [w2, h1 + h2], [0, h1 + h2]]
  };
  const bowArea = (w, f) => { const R = (w * w / 4 + f * f) / (2 * f), th = 2 * Math.asin(Math.min(1, w / 2 / R)); return R * R / 2 * (th - Math.sin(th)); };

  function offsetsOf(shape, s) {   // نقاط الشبكة داخل الشكل أو على حدوده (مع حافة صغيرة)
    let mu = Infinity, mv = Infinity, xu = -Infinity, xv = -Infinity;
    for (const p of shape) { mu = Math.min(mu, p[0]); mv = Math.min(mv, p[1]); xu = Math.max(xu, p[0]); xv = Math.max(xv, p[1]); }
    const ni = Math.ceil((xu - mu) / s), nj = Math.ceil((xv - mv) / s), offs = [];
    for (let j = 0; j <= nj; j++) for (let i = 0; i <= ni; i++) {
      const p = [mu + i * s, mv + j * s];
      let inside = pip(p, shape);
      if (!inside) { for (let k = 0; k < shape.length; k++) if (segDist(p, shape[k], shape[(k + 1) % shape.length]) < s * 0.75) { inside = true; break; } }
      if (inside) offs.push(i, j);
    }
    return { offs, ni, nj, mu, mv };
  }

  /* ---------- اقتراح الأشكال ---------- */
  function propose(P, types, prm) {
    P = ccw(clean(P));
    const parcelArea = Math.abs(ringArea(P));
    const dists = types.map(t => t === "front" ? prm.front : t === "back" ? prm.back : prm.side);
    const env = envelope(P, dists);
    const out = { parcelArea, env, options: [], warn: [] };
    if (!env || env.area < 4) { out.warn.push("لا تبقى مساحة للبناء بعد الارتدادات. قلّل الارتدادات أو تحقق من الأرض."); return out; }
    const covMax = prm.cover > 0 ? parcelArea * prm.cover / 100 : Infinity;
    const allowed = Math.min(covMax, env.area);
    out.covMax = covMax; out.allowed = allowed;
    let A = +prm.area || 0;
    if (!(A > 0)) { out.warn.push("أدخل مساحة البناء المطلوبة."); return out; }
    if (A > covMax + 0.01) { out.warn.push(`المساحة المطلوبة ${fmt(A)} م² أكبر من المسموح حسب نسبة البناء ${prm.cover}% (${fmt(covMax)} م²).`); out.over = true; }
    if (A > env.area + 0.01) { out.warn.push(`المساحة المطلوبة أكبر من مساحة الأرض بعد الارتدادات (${fmt(env.area)} م²).`); out.over = true; }
    if (out.over) return out;

    // الاتجاهات: موازٍ للشارع (أطول ضلع أمامي)، وموازٍ لأطول ضلع في الأرض إن اختلف
    const len = i => { const a = P[i], b = P[(i + 1) % P.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    let fi = -1; types.forEach((t, i) => { if (t === "front" && (fi < 0 || len(i) > len(fi))) fi = i; });
    let li = 0; P.forEach((_, i) => { if (len(i) > len(li)) li = i; });
    const dirs = [{ i: fi >= 0 ? fi : li, name: "موازٍ للشارع" }];
    const ang = i => { const a = P[i], b = P[(i + 1) % P.length]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const dA = Math.abs(((ang(li) - ang(dirs[0].i)) % Math.PI + Math.PI) % Math.PI);
    if (Math.min(dA, Math.PI - dA) > 5 * Math.PI / 180) dirs.push({ i: li, name: "موازٍ لأطول ضلع" });

    const s = prm.step || 0.2, pref = prm.pref || "front", arcs = prm.style === "arc";
    const opts = [];
    for (const D of dirs) {
      const F = frame(P, D.i), envL = env.ring.map(F.loc), g = grid(envL, s);
      const toW = (shape, ox, oy) => shape.map(p => F.wld([p[0] + ox, p[1] + oy]));
      const verifyW = sh => within(sh, env.ring);
      const fits = [];   // مستطيلات ممكنة
      const wMin = Math.max(5, Math.sqrt(A / 3)), wMax = Math.min(g.u1 - g.u0, Math.sqrt(A * 3));
      for (let w = Math.ceil(wMin / s) * s; w <= wMax + 1e-9; w += s) {
        const h = A / w, ni = Math.round(w / s), nj = Math.ceil(h / s - 1e-9);
        if (h < 5 || h > g.v1 - g.v0 + 1e-9) continue;
        const pl = placeRect(g, ni, nj, pref); if (!pl) continue;
        fits.push({ w, h, pl });
      }
      const mk = (kind, name, shapeL, info) => {
        const o = offsetsOf(shapeL, s);
        const pl = placeShape(g, o.offs, o.ni, o.nj, pref, c => verifyW(toW(shapeL, g.u0 + c.i * s - o.mu, g.v0 + c.j * s - o.mv)));
        if (!pl) return null;
        let ox = g.u0 + pl.i * s - o.mu, oy = g.v0 + pl.j * s - o.mv;
        // تدقيق: نزلق الشكل بخطوات صغيرة نحو المكان المفضّل ما دام داخل الغلاف (فتصير المسافة مطابقة للارتداد)
        const dv = pref === "back" ? 0.02 : pref === "mid" ? 0 : -0.02;
        if (dv) for (let k = 0; k < Math.ceil(s / 0.02) + 2; k++) { if (verifyW(toW(shapeL, ox, oy + dv))) oy += dv; else break; }
        return Object.assign({ kind, name, dir: D.name, dirIdx: D.i, local: shapeL, ox, oy, poly: toW(shapeL, ox, oy), area: Math.abs(ringArea(shapeL)) }, info);
      };
      if (!fits.length) continue;
      // اختيار مقاسات متنوعة: قريب من المربع، واجهة عريضة، عميق
      const byAsp = t => fits.slice().sort((a, b) => Math.abs(Math.log(a.w / a.h) - Math.log(t)) - Math.abs(Math.log(b.w / b.h) - Math.log(t)))[0];
      const picks = [];
      [[1.0, "مربّع تقريباً"], [1.6, "واجهة عريضة على الشارع"], [0.65, "عميق نحو الخلف"]].forEach(([t, lab]) => {
        const f = byAsp(t); if (f && !picks.some(p => Math.abs(p.w - f.w) < 1.2)) picks.push(Object.assign({ lab }, f)); });
      for (const f of picks) {
        if (!arcs) { const o = mk("rect", "مستطيل – " + f.lab, shapes.rect(f.w, f.h), { w: f.w, h: f.h }); if (o) opts.push(o); }
        else {
          const R1 = Math.min(3, f.w / 4, f.h / 4), k1 = (4 - Math.PI) / 4 * R1 * R1 * 2;
          const h1 = (A + k1) / f.w; let o = mk("roundFront", "زاويتان أماميتان مقوّستان – " + f.lab, shapes.roundFront(f.w, h1, R1), { w: f.w, h: h1, R: R1 }); if (o) opts.push(o);
          const R2 = Math.min(2, f.w / 5, f.h / 5), k2 = (4 - Math.PI) * R2 * R2, h2 = (A + k2) / f.w;
          o = mk("roundAll", "كل الزوايا مقوّسة – " + f.lab, shapes.roundAll(f.w, h2, R2), { w: f.w, h: h2, R: R2 }); if (o) opts.push(o);
          const fb = Math.min(2.5, f.w * 0.14), h3 = (A - bowArea(f.w, fb)) / f.w;
          if (h3 > 5) { o = mk("bowFront", "واجهة مقوّسة نحو الشارع – " + f.lab, shapes.bowFront(f.w, h3, fb), { w: f.w, h: h3, f: fb }); if (o) opts.push(o); }
        }
      }
      // أشكال L (زوايا قائمة): أعرض من المستطيل في الأمام مع جناح خلفي
      if (!arcs) {
        const base = picks[0] || fits[0]; let nL = 0;
        for (const wf of [1.25, 1.4]) for (const r2 of [0.55, 0.65]) for (const side of ["l", "r"]) {
          if (nL >= 2) break;
          const w = base.w * wf, w2 = w * r2, h1 = Math.max(5, base.h * 0.5), h2 = (A - w * h1) / w2;
          if (h2 < 3.5) continue;
          const o = mk("L", "شكل L – جناح خلفي " + (side === "r" ? "يمين" : "يسار"), shapes.L(w, h1, w2, h2, side), { w, h: h1 + h2, w2, h1, h2, side });
          if (o && !opts.some(x => x.kind === "L" && x.dir === D.name && x.side === side)) { opts.push(o); nL++; }
        }
      }
    }
    if (!opts.length) out.warn.push("لم أجد شكلاً بهذه المساحة يحترم كل الارتدادات. جرّب مساحة أصغر أو ارتدادات أقل.");
    // المسافات إلى الحدود لكل خيار
    opts.forEach(o => { o.dist = distances(o.poly, P, types); o.id = Math.random().toString(36).slice(2, 8); });
    out.options = opts;
    return out;
  }
  function distances(B, P, types) {
    const r = { front: Infinity, side: Infinity, back: Infinity };
    // نقاط كثيفة على حدود البناء
    const pts = []; for (let i = 0; i < B.length; i++) { const a = B[i], b = B[(i + 1) % B.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    P.forEach((a, i) => { const b = P[(i + 1) % P.length], t = types[i] || "side"; for (const p of pts) r[t] = Math.min(r[t], segDist(p, a, b)); });
    return r;
  }

  /* ---------- الأعمدة ---------- */
  function splitAxis(L, breaks, mode) {
    const pts = [0, ...breaks.filter(b => b > 0.5 && b < L - 0.5).sort((a, b) => a - b), L], out = [0];
    for (let k = 0; k + 1 < pts.length; k++) {
      const seg = pts[k + 1] - pts[k];
      let n = mode === "few" ? Math.ceil(seg / 5.5 - 1e-6) : mode === "short" ? Math.ceil(seg / 3.8 - 1e-6) : Math.ceil(seg / 4.6 - 1e-6);
      while (seg / n > 5.5 + 1e-6) n++;
      n = Math.max(1, n);
      for (let i = 1; i <= n; i++) out.push(pts[k] + seg * i / n);
    }
    return out;
  }
  const COL = [0.25, 0.5];
  function columns(o, mode, P) {
    const sh = o.local; let mu = Infinity, mv = Infinity, xu = -Infinity, xv = -Infinity;
    for (const p of sh) { mu = Math.min(mu, p[0]); mv = Math.min(mv, p[1]); xu = Math.max(xu, p[0]); xv = Math.max(xv, p[1]); }
    const W = o.w, H = o.h;
    const bx = o.kind === "L" ? [o.side === "r" ? W - o.w2 : o.w2] : [], by = o.kind === "L" ? [o.h1] : [];
    const xs = splitAxis(W, bx, mode), ys = splitAxis(H, by, mode);
    const inShape = p => pip(p, sh) || sh.some((a, k) => segDist(p, a, sh[(k + 1) % sh.length]) < 0.03);
    const cols = [];
    xs.forEach((x, ix) => ys.forEach((y, iy) => {
      let p = [x, y];
      if (!inShape(p)) {
        // زاوية مقوّسة: نضع العمود على القوس عند 45°
        if (o.R && (o.kind === "roundFront" || o.kind === "roundAll")) {
          const cx = x < W / 2 ? o.R : W - o.R, cy = y < H / 2 ? o.R : H - o.R, t = Math.atan2(y - cy, x - cx);
          p = [cx + o.R * Math.cos(t), cy + o.R * Math.sin(t)];
          cols.push({ p, ix, iy, rot: t + Math.PI / 2, edge: true }); return;
        }
        return;
      }
      cols.push({ p, ix, iy, rot: 0, edge: ix === 0 || iy === 0 || ix === xs.length - 1 || iy === ys.length - 1 });
    }));
    // نُدخل الأعمدة داخل خط البناء (الوجه الخارجي للعمود على الحد)
    cols.forEach(c => {
      if (c.rot) { const t = c.rot - Math.PI / 2; c.p = [c.p[0] - Math.cos(t) * COL[0] / 2, c.p[1] - Math.sin(t) * COL[0] / 2]; return; }
      const longX = c.iy === 0 || c.iy === ys.length - 1;   // أعمدة الواجهتين الأمامية والخلفية: الطول على امتداد الواجهة
      c.a = longX ? COL[1] : COL[0]; c.b = longX ? COL[0] : COL[1];
      const step = 0.01; let [x, y] = c.p;
      const inside = (x, y) => [[x - c.a / 2, y - c.b / 2], [x + c.a / 2, y - c.b / 2], [x + c.a / 2, y + c.b / 2], [x - c.a / 2, y + c.b / 2]].every(q => inShape(q));
      for (let k = 0; k < 60 && !inside(x, y); k++) { x += Math.sign(W / 2 - x) * step * (Math.abs(W / 2 - x) > 0.01 ? 1 : 0); y += Math.sign(H / 2 - y) * step * (Math.abs(H / 2 - y) > 0.01 ? 1 : 0); }
      c.p = [x, y];
    });
    const spans = (arr) => arr.slice(1).map((v, k) => v - arr[k]);
    const F = frame(P, o.dirIdx), w = q => F.wld([q[0] + o.ox, q[1] + o.oy]);
    const rectW = c => {
      if (c.rot) { const a = COL[1] / 2, b = COL[0] / 2, ct = Math.cos(c.rot), st = Math.sin(c.rot);
        return [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => w([c.p[0] + u * ct - v * st, c.p[1] + u * st + v * ct])); }
      return [[-c.a / 2, -c.b / 2], [c.a / 2, -c.b / 2], [c.a / 2, c.b / 2], [-c.a / 2, c.b / 2]].map(([u, v]) => w([c.p[0] + u, c.p[1] + v]));
    };
    return {
      mode, xs, ys, spansX: spans(xs), spansY: spans(ys), count: cols.length,
      cols: cols.map(c => ({ c: w(c.p), poly: rectW(c), ix: c.ix, iy: c.iy })),
      axesX: xs.map(x => [w([x, Math.min(0, mv) - 1.5]), w([x, xv + 1.5])]),
      axesY: ys.map(y => [w([Math.min(0, mu) - 1.5, y]), w([xu + 1.5, y])]),
      maxSpan: Math.max(...spans(xs), ...spans(ys))
    };
  }

  /* أنواع الأضلاع تلقائياً بعد تحديد ضلع الشارع: الأضلاع الموازية تقريباً والبعيدة خلفية، والباقي جانبية */
  function autoTypes(P, fronts) {
    P = ccw(clean(P));
    const n = P.length, t = new Array(n).fill("side");
    fronts.forEach(i => t[i] = "front");
    if (!fronts.length) return t;
    const ang = i => { const a = P[i], b = P[(i + 1) % n]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const mid = i => { const a = P[i], b = P[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    const f = fronts[0], F = frame(P, f);
    let depth = 0; P.forEach(p => depth = Math.max(depth, F.loc(p)[1]));
    for (let i = 0; i < n; i++) {
      if (t[i] === "front") continue;
      const x = Math.abs(ang(i) - ang(f)) % Math.PI, d = Math.min(x, Math.PI - x);   // 0 = موازٍ للشارع
      const v = F.loc(mid(i))[1];
      if (d < 35 * Math.PI / 180 && v > depth * 0.55) t[i] = "back";
    }
    return t;
  }

  const fmt = (v, d = 0) => Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  G.Bina = { ringArea, ccw, clean, pip, envelope, propose, columns, autoTypes, distances, within, frame };
})(typeof window !== "undefined" ? window : globalThis);
