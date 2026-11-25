/* مجسم ثلاثي الأبعاد لحاسبة الجرف: سطح الأرض قبل الجرف وبعده، وجوانب القطعة كمقطع بطبقاتها
   (صخر، تربة سطحية، طمم بالأزرق، والتراب المحفور بالأحمر الشفاف). يُبنى من نتيجة الحساب نفسها (zB, zA, mask). */
(function () {
  "use strict";
  let ui = null, R3 = null, last = null;
  const st = { mode: "both", ex: 1 };
  try { Object.assign(st, JSON.parse(localStorage.getItem("jarf-3d") || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem("jarf-3d", JSON.stringify(st)); } catch (e) {} };

  function css() {
    const s = document.createElement("style");
    s.textContent = `
#v3d{position:fixed;inset:0;z-index:9999;background:radial-gradient(120% 90% at 50% 20%,#2b4a3a 0%,#11241b 60%,#0a1711 100%);display:flex;flex-direction:column;font-family:inherit;direction:rtl;touch-action:none}
#v3d .top{display:flex;align-items:center;gap:6px;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;background:rgba(6,30,20,.85);border-bottom:2px solid #c99a2e;flex-wrap:wrap}
#v3d .top b{color:#f3dc93;font-size:16px;margin-inline-end:auto}
#v3d button{font:700 13.5px inherit;font-family:inherit;border:1.5px solid rgba(243,220,147,.55);background:rgba(255,255,255,.06);color:#f3dc93;border-radius:10px;padding:6px 10px;cursor:pointer}
#v3d button.on{background:linear-gradient(180deg,#fff1b8,#e6c35f);color:#3a2606;border-color:transparent}
#v3d .cv{flex:1;position:relative;min-height:0}
#v3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#v3d .leg{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(6,30,20,.85);color:#e8efe1;font-size:12.5px}
#v3d .leg i{display:inline-block;width:14px;height:10px;border-radius:3px;margin-inline-end:4px;vertical-align:middle}
#v3d .hint{position:absolute;bottom:8px;left:0;right:0;text-align:center;color:rgba(255,255,255,.7);font-size:12px;pointer-events:none}
#v3d .row2{display:flex;gap:6px;align-items:center;width:100%}
#v3d .row2 span{color:#e8efe1;font-size:12.5px}`;
    document.head.appendChild(s);
  }

  /* ---------- بناء الأشكال ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  function hyp(t) {   // لون الارتفاع: أخضر منخفض → زيتي → ترابي → بني فاتح
    const S = [[0, [74, 122, 62]], [0.35, [128, 146, 74]], [0.65, [176, 150, 98]], [1, [204, 186, 152]]];
    for (let k = 1; k < S.length; k++) if (t <= S[k][0]) { const [a, ca] = S[k - 1], [b, cb] = S[k], u = (t - a) / (b - a || 1); return ca.map((v, i) => lerp(v, cb[i], u) / 255); }
    return S[3][1].map(v => v / 255);
  }
  function build(r) {
    const T = window.THREE, E = st.ex;
    const K = Math.max(1, Math.ceil(Math.max(r.nx, r.ny) / 170)), cs = r.cs;
    const NX = Math.floor((r.nx - 1) / K) + 1, NY = Math.floor((r.ny - 1) / K) + 1;
    const B = new Float32Array(NX * NY).fill(NaN), A = new Float32Array(NX * NY).fill(NaN);
    let zmin = Infinity, zmax = -Infinity;
    for (let b = 0; b < NY; b++) for (let a = 0; a < NX; a++) {
      const i = a * K, j = b * K, idx = j * r.nx + i;
      if (!r.mask[idx]) continue; const zb = r.zB[idx], za = r.zA[idx]; if (zb !== zb || za !== za) continue;
      B[b * NX + a] = zb; A[b * NX + a] = za; zmin = Math.min(zmin, zb, za); zmax = Math.max(zmax, zb, za);
    }
    if (!isFinite(zmin)) return null;
    const span = Math.max(r.w, r.h), cx = r.w / 2, cy = r.h / 2;
    const base = zmin - Math.max(1.5, (zmax - zmin) * 0.6, span * 0.04);
    const P = (a, b, z) => [(a * K + 0.5) * cs - cx, (z) * E, -((b * K + 0.5) * cs - cy)];
    const ok = (a, b) => a >= 0 && b >= 0 && a < NX && b < NY && B[b * NX + a] === B[b * NX + a];
    const quadIn = (a, b) => ok(a, b) && ok(a + 1, b) && ok(a, b + 1) && ok(a + 1, b + 1);
    const G = new T.Group();
    const mat = (o) => new T.MeshLambertMaterial(Object.assign({ vertexColors: true, side: T.DoubleSide }, o || {}));

    // سطح (قبل أو بعد)
    function surface(Z, colorOf, matOpt) {
      const pos = [], col = [];
      const v = (a, b) => { const z = Z[b * NX + a]; pos.push(...P(a, b, z)); col.push(...colorOf(a, b, z)); };
      for (let b = 0; b < NY - 1; b++) for (let a = 0; a < NX - 1; a++) {
        if (!quadIn(a, b)) continue;
        v(a, b); v(a + 1, b); v(a + 1, b + 1); v(a, b); v(a + 1, b + 1); v(a, b + 1);
      }
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      return new T.Mesh(g, mat(matOpt));
    }
    const rng = Math.max(0.01, zmax - zmin), maxAbs = Math.max(r.maxCut, r.maxFill, 0.01);
    const colB = (a, b, z) => hyp((z - zmin) / rng);
    const colA = (a, b, z) => { const d = z - B[b * NX + a], t = Math.min(1, Math.abs(d) / maxAbs);
      if (Math.abs(d) < 0.02) return [0.78, 0.77, 0.72];
      return d < 0 ? [lerp(0.86, 0.76, t), lerp(0.74, 0.27, t), lerp(0.66, 0.16, t)] : [lerp(0.7, 0.15, t), lerp(0.8, 0.47, t), lerp(0.9, 0.71, t)]; };

    // الجوانب: مقطع بطبقات على حدود المنطقة
    const walls = { rock: [[], []], soil: [[], []], fill: [[], []], cut: [[], []], nat: [[], []] };
    function band(key, p, q, z0p, z1p, z0q, z1q, c0, c1) {
      const W = walls[key], A1 = P(p[0], p[1], z0p), A2 = P(p[0], p[1], z1p), B1 = P(q[0], q[1], z0q), B2 = P(q[0], q[1], z1q);
      W[0].push(...A1, ...B1, ...B2, ...A1, ...B2, ...A2);
      const cc = [c0, c0, c1, c0, c1, c1]; cc.forEach(c => W[1].push(...c));
    }
    const SOIL = 0.5;
    function edge(p, q, after) {
      const bp = B[p[1] * NX + p[0]], bq = B[q[1] * NX + q[0]], ap = A[p[1] * NX + p[0]], aq = A[q[1] * NX + q[0]];
      const np = after ? Math.min(bp, ap) : bp, nq = after ? Math.min(bq, aq) : bq;   // الأرض الطبيعية الباقية
      const sp = Math.max(base, np - SOIL), sq = Math.max(base, nq - SOIL);
      band("rock", p, q, base, sp, base, sq, [0.55, 0.5, 0.44], [0.66, 0.6, 0.5]);
      band("soil", p, q, sp, np, sq, nq, [0.45, 0.32, 0.2], [0.36, 0.26, 0.16]);
      if (after) {
        band("fill", p, q, bp, Math.max(bp, ap), bq, Math.max(bq, aq), [0.2, 0.47, 0.72], [0.3, 0.58, 0.82]);
        band("cut", p, q, ap, Math.max(ap, bp), aq, Math.max(aq, bq), [0.85, 0.3, 0.2], [0.95, 0.45, 0.3]);
      }
    }
    function wallsFor(after) {
      for (const k in walls) walls[k] = [[], []];
      for (let b = 0; b < NY - 1; b++) for (let a = 0; a < NX - 1; a++) {
        if (!quadIn(a, b)) continue;
        if (!quadIn(a, b - 1)) edge([a, b], [a + 1, b], after);
        if (!quadIn(a, b + 1)) edge([a, b + 1], [a + 1, b + 1], after);
        if (!quadIn(a - 1, b)) edge([a, b], [a, b + 1], after);
        if (!quadIn(a + 1, b)) edge([a + 1, b], [a + 1, b + 1], after);
      }
      const out = new T.Group();
      for (const k in walls) { const [pos, col] = walls[k]; if (!pos.length) continue;
        const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
        out.add(new T.Mesh(g, mat(k === "cut" ? { transparent: true, opacity: 0.45, depthWrite: false } : {}))); }
      return out;
    }
    // القاعدة السفلية
    function bottom() {
      const pos = [];
      for (let b = 0; b < NY - 1; b++) for (let a = 0; a < NX - 1; a++) { if (!quadIn(a, b)) continue;
        const p = (x, y) => P(x, y, base); pos.push(...p(a, b), ...p(a + 1, b + 1), ...p(a + 1, b), ...p(a, b), ...p(a, b + 1), ...p(a + 1, b + 1)); }
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      return new T.Mesh(g, new T.MeshLambertMaterial({ color: 0x4a4038, side: T.DoubleSide }));
    }
    const m = st.mode;
    if (m === "before") { G.add(surface(B, colB)); G.add(wallsFor(false)); }
    else if (m === "after") { G.add(surface(A, colA)); G.add(wallsFor(true)); }
    else { G.add(surface(A, colA)); G.add(wallsFor(true)); G.add(surface(B, colB, { transparent: true, opacity: 0.42, depthWrite: false })); }
    G.add(bottom());
    // سهم الشمال
    const nh = Math.max(2, span * 0.08), arrow = new T.Mesh(new T.ConeGeometry(nh * 0.25, nh, 16), new T.MeshLambertMaterial({ color: 0xe53935 }));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(-cx - nh, (zmax + 0.5) * E, -(r.h - cy) - nh * 0.2); G.add(arrow);
    return { G, span, zc: ((zmin + zmax) / 2) * E, zr: (zmax - base) * E };
  }

  /* ---------- المشهد والتحكم باللمس ---------- */
  function scene() {
    const T = window.THREE, cv = ui.querySelector("canvas"), box = ui.querySelector(".cv");
    const ren = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: true });
    ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(40, 1, 0.1, 100000);
    sc.add(new T.HemisphereLight(0xfff6e0, 0x34402c, 0.55));
    const sun = new T.DirectionalLight(0xffffff, 0.55); sun.position.set(-1, 2, 1.2); sc.add(sun);
    const O = { th: -0.6, ph: 0.95, d: 100, tx: 0, ty: 0, tz: 0 };
    R3 = { T, ren, sc, cam, O, grp: null, box };
    const place = () => { const { th, ph, d, tx, ty, tz } = O; cam.position.set(tx + d * Math.sin(ph) * Math.sin(th), ty + d * Math.cos(ph), tz + d * Math.sin(ph) * Math.cos(th)); cam.lookAt(tx, ty, tz); };
    R3.draw = () => { const w = box.clientWidth, h = box.clientHeight; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); place(); ren.render(sc, cam); };
    // لمس: إصبع = تدوير، إصبعين = تكبير وتحريك
    const pts = new Map(); let p0 = null;
    cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); p0 = null; });
    cv.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { O.th -= (e.clientX - prev[0]) * 0.008; O.ph = Math.max(0.12, Math.min(1.5, O.ph - (e.clientY - prev[1]) * 0.006)); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (p0) { O.d = Math.max(2, Math.min(50000, O.d * p0.dist / dist)); const k = O.d / 600, dx = mid[0] - p0.mid[0], dy = mid[1] - p0.mid[1];
          const c = Math.cos(O.th), s = Math.sin(O.th);   // يمين الشاشة (c,0,-s) · للأمام (-s,0,-c)
          O.tx += (-dx * c + dy * s) * k; O.tz += (dx * s + dy * c) * k; }
        p0 = { dist, mid }; }
      R3.draw();
    });
    const up = e => { pts.delete(e.pointerId); p0 = null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", e => { e.preventDefault(); O.d = Math.max(2, O.d * (e.deltaY > 0 ? 1.12 : 0.89)); R3.draw(); }, { passive: false });
    window.addEventListener("resize", () => ui && !ui.hidden && R3.draw());
  }
  function rebuild(reset) {
    if (R3.grp) { R3.sc.remove(R3.grp); R3.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const b = build(last); if (!b) return;
    R3.grp = b.G; R3.sc.add(b.G);
    if (reset) Object.assign(R3.O, { th: -0.6, ph: 0.95, d: b.span * 1.5 + b.zr, tx: 0, ty: b.zc, tz: 0 });
    else R3.O.ty = b.zc;
    ui.querySelectorAll("[data-m]").forEach(x => x.classList.toggle("on", x.dataset.m === st.mode));
    ui.querySelectorAll("[data-e]").forEach(x => x.classList.toggle("on", +x.dataset.e === st.ex));
    ui.querySelector(".leg").innerHTML = (st.mode === "before" ? "" : '<span><i style="background:#c94a35"></i>حفر (التراب اللي بينشال)</span><span><i style="background:#3d82bd"></i>طمم</span>') +
      '<span><i style="background:linear-gradient(90deg,#4a7a3e,#ccba98)"></i>سطح الأرض قبل</span><span><i style="background:#5c4028"></i>تربة سطحية</span><span><i style="background:#988a74"></i>صخر / أساس</span>' +
      (st.ex > 1 ? `<span>الارتفاعات مكبّرة ×${st.ex}</span>` : "");
    R3.draw();
  }
  function open(r) {
    if (!window.THREE) { alert("مكتبة الرسم ثلاثي الأبعاد لم تُحمَّل"); return; }
    last = r;
    if (!ui) {
      css(); ui = document.createElement("div"); ui.id = "v3d";
      ui.innerHTML = `<div class="top"><b>🧊 مجسم الجرف</b>
        <button data-m="before">قبل الجرف</button><button data-m="after">بعد الجرف</button><button data-m="both">الاثنين</button>
        <button id="v3shot">📷</button><button id="v3x">✕</button>
        <div class="row2"><span>تكبير الارتفاعات:</span><button data-e="1">×1</button><button data-e="2">×2</button><button data-e="3">×3</button><button data-e="5">×5</button><button id="v3r">↺ الوضع الأصلي</button></div></div>
        <div class="cv"><canvas></canvas><div class="hint">إصبع واحد: لفّ المجسم · إصبعين: كبّر وحرّك</div></div><div class="leg"></div>`;
      document.body.appendChild(ui); scene();
      ui.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { st.mode = b.dataset.m; save(); rebuild(false); });
      ui.querySelectorAll("[data-e]").forEach(b => b.onclick = () => { st.ex = +b.dataset.e; save(); rebuild(false); });
      ui.querySelector("#v3r").onclick = () => rebuild(true);
      ui.querySelector("#v3x").onclick = close;
      ui.querySelector("#v3shot").onclick = shot;
    }
    ui.hidden = false; document.body.style.overflow = "hidden";
    prevBack = window.__back; window.__back = () => { close(); return 1; };
    requestAnimationFrame(() => rebuild(true));
  }
  let prevBack = null;
  function close() { if (!ui) return; ui.hidden = true; document.body.style.overflow = ""; window.__back = prevBack; }
  function shot() {
    R3.draw(); const url = R3.ren.domElement.toDataURL("image/png"), name = "مجسم الجرف.png";
    if (window.AndroidBridge && AndroidBridge.saveFile) { try { AndroidBridge.saveFile(name, url.split(",")[1], "image/png"); return; } catch (e) {} }
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  }
  window.Jarf3D = { open, close };
})();
