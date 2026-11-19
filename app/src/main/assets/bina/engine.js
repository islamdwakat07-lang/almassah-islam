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
  function polySegDist(B, a, b) {   // أقرب مسافة بين مضلع وقطعة
    let m = Infinity;
    for (const p of B) m = Math.min(m, segDist(p, a, b));
    for (let i = 0; i < B.length; i++) { const c = B[i], d = B[(i + 1) % B.length]; m = Math.min(m, segDist(a, c, d), segDist(b, c, d)); }
    return m;
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
      [a, b].forEach(q => { const c = circle(q, d / Math.cos(Math.PI / 48) + 1e-4, 48); c.push(c[0]); cuts.push([c]); });
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
  function placeShape(g, offs, ni, nj, pref, verify, scorer) {
    const cu = (g.nu - 1) / 2, cvv = (g.nv - 1) / 2, cand = [];
    for (let j = 0; j + nj < g.nv; j++) for (let i = 0; i + ni < g.nu; i++) {
      // اختبار سريع لزوايا الصندوق المحيط بالشكل أولاً غير ممكن (الشكل ليس مستطيلاً)، لذا نختبر النقاط
      let ok = true;
      for (let k = 0; k < offs.length; k += 2) { if (!g.ins[(j + offs[k + 1]) * g.nu + i + offs[k]]) { ok = false; break; } }
      if (!ok) continue;
      const mu = i + ni / 2, mv = j + nj / 2;
      cand.push({ i, j, sc: scorer ? scorer(i, j) : pref === "back" ? -mv * 1000 + Math.abs(mu - cu) : pref === "mid" ? Math.hypot(mu - cu, mv - cvv) * 1000 : mv * 1000 + Math.abs(mu - cu) });
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
    // حواف الشارع والخلف الحقيقية (للتموضع بغض النظر عن اتجاه البناء)
    const segsOf = t => types.map((x, i) => x === t ? [P[i], P[(i + 1) % P.length]] : null).filter(Boolean);
    const FS = segsOf("front"), BS = segsOf("back");
    const F0 = frame(P, dirs[0].i), envC = env.ring.map(F0.loc);
    let cu0 = 0; { let a0 = Infinity, a1 = -Infinity; envC.forEach(p => { a0 = Math.min(a0, p[0]); a1 = Math.max(a1, p[0]); }); cu0 = (a0 + a1) / 2; }
    const envCen = (() => { let x = 0, y = 0; env.ring.forEach(p => { x += p[0]; y += p[1]; }); return [x / env.ring.length, y / env.ring.length]; })();
    const dTo = (B, S) => { let m = Infinity; for (const [a, b] of S) m = Math.min(m, polySegDist(B, a, b)); return m; };
    const cenOf = B => { let x = 0, y = 0; B.forEach(p => { x += p[0]; y += p[1]; }); return [x / B.length, y / B.length]; };
    // درجة المكان: الأقل أفضل. قرب الشارع = ألصق ما يمكن بخط الارتداد الأمامي ثم في المنتصف على طول الشارع
    const placeScore = B => {
      const c = cenOf(B), side = Math.abs(F0.loc(c)[0] - cu0);
      if (pref === "mid") return Math.hypot(c[0] - envCen[0], c[1] - envCen[1]);
      if (pref === "back") return (BS.length ? Math.round(dTo(B, BS) / s) : -Math.round(dTo(B, FS) / s)) * 1000 + side;
      return Math.round(dTo(B, FS) / s) * 1000 + side;
    };
    // اتجاه الانزلاق النهائي (عالمي): نحو الشارع أو بعيداً عنه
    const slideW = pref === "front" ? [-F0.n[0], -F0.n[1]] : pref === "back" ? [F0.n[0], F0.n[1]] : null;
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
        const at = (i, j) => toW(shapeL, g.u0 + i * s - o.mu, g.v0 + j * s - o.mv);
        const pl = placeShape(g, o.offs, o.ni, o.nj, pref, c => verifyW(at(c.i, c.j)), (i, j) => placeScore(at(i, j)));
        if (!pl) return null;
        let ox = g.u0 + pl.i * s - o.mu, oy = g.v0 + pl.j * s - o.mv;
        // تدقيق: نزلق الشكل بخطوات 1 سم نحو الشارع (أو الخلف) ما دام داخل الغلاف، فيلتصق بخط الارتداد تماماً
        if (slideW) {
          const du = slideW[0] * F.d[0] + slideW[1] * F.d[1], dvv = slideW[0] * F.n[0] + slideW[1] * F.n[1];
          for (const st of [0.1, 0.01, 0.002]) for (let k = 0; k < 400; k++) { if (verifyW(toW(shapeL, ox + du * st, oy + dvv * st))) { ox += du * st; oy += dvv * st; } else break; }
        }
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
      // يملأ العرض بين الارتدادات الجانبية: أعرض بناء ممكن ملاصق للشارع (مهم للأراضي الضيقة)
      if (D === dirs[0] && pref !== "mid") {
        // أعرض مستطيل يلامس خط الارتداد (أول صف من الشبكة من جهة الشارع أو الخلف)
        const atEdge = f => pref === "back" ? (f.pl.j + Math.round(A / f.w / s)) >= g.nv - 2 : f.pl.j <= 1;
        const fw = fits.filter(atEdge).sort((a, b) => b.w - a.w)[0];
        if (fw && fw.w < wMax - 1.5 * s && !opts.some(x => x.dirIdx === D.i && Math.abs(x.w - fw.w) < 0.3)) {
          const build = w => { const h = A / w;
            if (!arcs) return { kind: "rect", shape: shapes.rect(w, h), info: { w, h } };
            const R = Math.min(3, w / 4, h / 4), k1 = (4 - Math.PI) / 4 * R * R * 2, h1 = (A + k1) / w;
            return { kind: "roundFront", shape: shapes.roundFront(w, h1, R), info: { w, h: h1, R } }; };
          let w = fw.w, b0 = build(w);
          let o = mk(b0.kind, (arcs ? "زاويتان أماميتان مقوّستان" : "مستطيل") + " – يملأ العرض بين الارتدادات الجانبية", b0.shape, b0.info);
          if (o) {
            // توسيع بخطوات 5 سم ثم 1 سم يميناً ويساراً حتى يلمس خطي الارتداد الجانبيين (العمق يقل ليبقى نفس المساحة)
            let ox = o.ox, oy = o.oy;
            for (const st of [0.05, 0.01, 0.002]) for (let k = 0; k < 600; k++) {
              const bL = build(w + st), okL = within(toW(bL.shape, ox - st, oy), env.ring), okR = !okL && within(toW(bL.shape, ox, oy), env.ring);
              if (okL) { w += st; ox -= st; } else if (okR) w += st; else break;
            }
            const b = build(w);
            Object.assign(o, b.info, { local: b.shape, ox, oy, poly: toW(b.shape, ox, oy), area: Math.abs(ringArea(b.shape)) });
            opts.push(o);
          }
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
    // شكل يتبع خطوط الارتداد نفسها: من خط الارتداد الأمامي (أو الخلفي) بكامل العرض المسموح حتى تكتمل المساحة
    if (pref !== "mid") {
      const pc = G.polygonClipping, F = F0, envL = env.ring.map(F.loc);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      envL.forEach(p => { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); });
      const ringE = [[...envL, envL[0]]];
      const cut = t => { const band = pref === "back" ? [[[u0 - 1, t], [u1 + 1, t], [u1 + 1, v1 + 1], [u0 - 1, v1 + 1], [u0 - 1, t]]] : [[[u0 - 1, v0 - 1], [u1 + 1, v0 - 1], [u1 + 1, t], [u0 - 1, t], [u0 - 1, v0 - 1]]];
        const r = pc.intersection(ringE, band); let best = null, ba = 0;
        for (const poly of r) { const q = clean(poly[0]); const a = Math.abs(ringArea(q)) - poly.slice(1).reduce((x, h) => x + Math.abs(ringArea(h)), 0); if (a > ba) { ba = a; best = q; } }
        return { ring: best, area: ba }; };
      let lo = v0, hi = v1, res = null;
      for (let k = 0; k < 45; k++) { const t = (lo + hi) / 2, a = cut(t).area;
        if (pref === "back") { if (a > A) lo = t; else hi = t; } else { if (a < A) lo = t; else hi = t; } }
      const t = pref === "back" ? lo : hi; res = cut(t);
      if (res.ring && Math.abs(res.area - A) < Math.max(0.5, A * 0.01) && res.ring.length >= 3) {
        const R = ccw(res.ring); let mu = Infinity, mv = Infinity, xu = -Infinity, xv = -Infinity;
        R.forEach(p => { mu = Math.min(mu, p[0]); mv = Math.min(mv, p[1]); xu = Math.max(xu, p[0]); xv = Math.max(xv, p[1]); });
        const local = R.map(p => [p[0] - mu, p[1] - mv]);
        opts.unshift({ kind: "fill", name: "يتبع خطوط الارتداد – يستغل كل سم", dir: dirs[0].name, dirIdx: dirs[0].i, local, ox: mu, oy: mv,
          poly: R.map(F.wld), area: Math.abs(ringArea(R)), w: xu - mu, h: xv - mv });
      }
    }
    if (!opts.length) out.warn.push("لم أجد شكلاً بهذه المساحة يحترم كل الارتدادات. جرّب مساحة أصغر أو ارتدادات أقل.");
    // المسافات إلى الحدود لكل خيار
    opts.forEach(o => { o.dist = distances(o.poly, P, types); o.id = Math.random().toString(36).slice(2, 8); });
    if (pref === "front" && opts.length && FS.length) {
      const minF = Math.min(...opts.map(o => o.dist.front));
      if (minF > prm.front + 0.1) {
        // عرض المتاح قرب الشارع (مقطع الغلاف بعد خط الارتداد الأمامي بنصف متر)
        const vq = Math.min(...envC.map(p => p[1])) + 0.5, xsI = [];
        envC.forEach((p, i) => { const q = envC[(i + 1) % envC.length]; if ((p[1] - vq) * (q[1] - vq) < 0) xsI.push(p[0] + (vq - p[1]) / (q[1] - p[1]) * (q[0] - p[0])); });
        xsI.sort((x, y) => x - y); let wq = 0; for (let k = 0; k + 1 < xsI.length; k += 2) wq = Math.max(wq, xsI[k + 1] - xsI[k]);
        out.warn.push(`الأرض قرب الشارع ضيقة: العرض المتاح للبناء عند خط الارتداد الأمامي حوالي ${fmt(wq, 1)} م فقط، وهو أضيق من أشكال البناء المقترحة، لذلك أقرب ما يصل إليه البناء ${fmt(minF, 2)} م من الشارع. ليلتصق البناء بخط الارتداد الأمامي قلّل المساحة أو الارتداد الجانبي.`);
      }
    }
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
  /* تقسيم واجهة إلى بحور، كل بحر لا يزيد عن MAXS (5 م) بين محاور الأعمدة
     eq: متساوية بأقل عدد · eqp: متساوية بعمود إضافي · sym: متماثلة بحر وسطي أوسع · svc: بحر 3 م للدرج/الخدمات ثم متساوية */
  const MAXS = 5.0;
  function spansOf(seg, mode) {
    const n0 = Math.max(1, Math.ceil(seg / MAXS - 1e-6)), eq = n => Array(n).fill(seg / n);
    if (seg <= MAXS + 1e-6 && mode !== "eqp") return [seg];
    if (mode === "eqp") { const n = n0 + 1; return seg / n >= 2.4 ? eq(n) : eq(n0); }
    if (mode === "sym") {
      const n = Math.max(3, n0); if (seg / n < 2.4) return eq(n0);
      // البحر/البحران الأوسطيان أوسع بـ 25% من الطرفيين، والكل ≤ 5 م
      const mid = n % 2 ? 1 : 2, w = Array.from({ length: n }, (_, k) => (n % 2 ? k === (n - 1) / 2 : k === n / 2 - 1 || k === n / 2) ? 1.25 : 1);
      let sc = seg / w.reduce((a, b) => a + b, 0); let r = w.map(v => v * sc);
      if (Math.max(...r) > MAXS + 1e-6) { const big = MAXS, rest = (seg - big * mid) / (n - mid); if (rest > 0 && rest <= MAXS) r = w.map(v => v > 1 ? big : rest); else return eq(Math.max(n, n0)); }
      return r;
    }
    if (mode === "svc") {
      if (seg < 7) return eq(n0);
      const rest = seg - 3, n = Math.max(1, Math.ceil(rest / MAXS - 1e-6));
      return [3, ...Array(n).fill(rest / n)];
    }
    return eq(n0);
  }
  function splitAxis(L, breaks, mode) {
    const pts = [0, ...breaks.filter(b => b > 0.5 && b < L - 0.5).sort((a, b) => a - b), L], out = [0];
    for (let k = 0; k + 1 < pts.length; k++) {
      let acc = pts[k];
      const sp = spansOf(pts[k + 1] - pts[k], mode);
      sp.forEach((v, i) => { acc += v; out.push(i === sp.length - 1 ? pts[k + 1] : acc); });
    }
    return out;
  }
  const COL = [0.25, 0.5];
  /* أعمدة لشكل غير منتظم (يتبع خطوط الارتداد): صفوف بعرض الشكل، وأعمدة طرفية على الحد المائل لكل صف */
  function columnsFill(o, mode, P) {
    const sh = o.local, W = o.w, H = o.h;
    const [mx, my] = String(mode).includes("|") ? String(mode).split("|") : [mode, mode];
    const xs = splitAxis(W, [], mx), ys = splitAxis(H, [], my);
    const inShape = p => pip(p, sh) || sh.some((a, k) => segDist(p, a, sh[(k + 1) % sh.length]) < 0.03);
    const rowSpan = y => { const X = []; sh.forEach((p, i) => { const q = sh[(i + 1) % sh.length]; if ((p[1] - y) * (q[1] - y) <= 0 && p[1] !== q[1]) X.push(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0])); });
      X.sort((a, b) => a - b); return X.length >= 2 ? [X[0], X[X.length - 1]] : null; };
    const cols = [];
    ys.forEach((y0, iy) => {
      const yy = Math.min(H - 0.13, Math.max(0.13, y0)), sp = rowSpan(yy); if (!sp) return;
      const xa = sp[0] + 0.13, xb = sp[1] - 0.13, row = [xa];
      xs.forEach(x => { if (x > xa + 1.5 && x < xb - 1.5) row.push(x); });
      row.push(xb);
      // لا يزيد أي بحر عن 5 م
      for (let k = 0; k + 1 < row.length; k++) if (row[k + 1] - row[k] > MAXS + 1e-6) { const n = Math.ceil((row[k + 1] - row[k]) / MAXS); const add = []; for (let j = 1; j < n; j++) add.push(row[k] + (row[k + 1] - row[k]) * j / n); row.splice(k + 1, 0, ...add); k += add.length; }
      row.forEach((x, ix) => cols.push({ p: [x, y0], ix, iy, edge: true }));
    });
    cols.forEach(c => {
      const longX = c.iy === 0 || c.iy === ys.length - 1; c.a = longX ? COL[1] : COL[0]; c.b = longX ? COL[0] : COL[1];
      let [x, y] = c.p; const cx = W / 2, cy = H / 2;
      const inside = (x, y) => [[x - c.a / 2, y - c.b / 2], [x + c.a / 2, y - c.b / 2], [x + c.a / 2, y + c.b / 2], [x - c.a / 2, y + c.b / 2]].every(q => inShape(q));
      for (let k = 0; k < 120 && !inside(x, y); k++) { const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1; x += dx / d * 0.01; y += dy / d * 0.01; }
      c.p = [x, y];
    });
    const spans = arr => arr.slice(1).map((v, k) => v - arr[k]);
    const F = frame(P, o.dirIdx), w = q => F.wld([q[0] + o.ox, q[1] + o.oy]);
    const rectW = c => [[-c.a / 2, -c.b / 2], [c.a / 2, -c.b / 2], [c.a / 2, c.b / 2], [-c.a / 2, c.b / 2]].map(([u, v]) => w([c.p[0] + u, c.p[1] + v]));
    let maxSpan = Math.max(...spans(ys));
    ys.forEach((_, iy) => { const r = cols.filter(c => c.iy === iy).map(c => c.p[0]).sort((a, b) => a - b); spans(r).forEach(v => maxSpan = Math.max(maxSpan, v)); });
    return {
      mode, xs, ys, spansX: spans(xs), spansY: spans(ys), count: cols.length,
      cols: cols.map(c => ({ c: w(c.p), poly: rectW(c), ix: c.ix, iy: c.iy })),
      axesX: xs.map(x => [w([x, -1.5]), w([x, H + 1.5])]),
      axesY: ys.map(y => [w([-1.5, y]), w([W + 1.5, y])]),
      maxSpan
    };
  }
  function columns(o, mode, P) {
    if (o.kind === "fill") return columnsFill(o, mode, P);
    const sh = o.local; let mu = Infinity, mv = Infinity, xu = -Infinity, xv = -Infinity;
    for (const p of sh) { mu = Math.min(mu, p[0]); mv = Math.min(mv, p[1]); xu = Math.max(xu, p[0]); xv = Math.max(xv, p[1]); }
    const W = o.w, H = o.h;
    const bx = o.kind === "L" ? [o.side === "r" ? W - o.w2 : o.w2] : [], by = o.kind === "L" ? [o.h1] : [];
    const [mx, my] = String(mode).includes("|") ? String(mode).split("|") : [mode, mode];
    const xs = splitAxis(W, bx, mx), ys = splitAxis(H, by, my);
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
