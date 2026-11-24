/* الصور الجوية لكل أدوات التطبيق من البلاطات (سريعة): جيومولج أولاً، ثم Esri World Imagery إذا توقف جيومولج.
   (طلب export من جيومولج بطيء جداً أو يتعلق أحياناً، أما البلاطات فجاهزة فوراً)
   بلاطات Esri (Web Mercator) تُرسم مُحوَّلة إلى نظام فلسطين 28191 أو الإسرائيلي ITM 2039
   (تحويل أفيني لكل منطقة صغيرة — الخطأ سنتيمترات). البلاطات تدعم CORS فالصورة تصلح للـ PDF. */
(function () {
  "use strict";
  const ME = document.currentScript ? document.currentScript.src : location.href;
  const DEFS = {
    "EPSG:28191": "+proj=cass +lat_0=31.73409694444445 +lon_0=35.21208055555556 +x_0=170251.555 +y_0=126867.909 +a=6378300.789 +b=6356566.435 +towgs84=-275.722,94.7824,340.894,-8.001,-4.42,-11.821,1 +units=m +no_defs",
    "EPSG:2039": "+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs"
  };
  let projP = null;
  function ensureProj() {
    if (!projP) projP = (window.proj4 ? Promise.resolve() : new Promise(ok => { const s = document.createElement("script"); s.src = new URL("geomolg/lib/proj4.js", ME).href; s.onload = ok; s.onerror = ok; document.head.appendChild(s); }))
      .then(() => { if (!window.proj4) throw new Error("proj4"); for (const k in DEFS) if (!proj4.defs(k)) proj4.defs(k, DEFS[k]); });
    return projP;
  }
  const HALF = 20037508.342789244, cache = new Map();
  const GM = "https://orthophotos.geomolg.ps/adaptor/rest/services/";
  const GM_RES = [529.1677250021168, 264.5838625010584, 132.2919312505292, 66.1459656252646, 33.0729828126323, 16.933367200067735, 8.466683600033868, 4.233341800016934, 2.116670900008467, 1.0583354500042335, 0.5291677250021167, 0.26458386250105836, 0.13229193125052918, 0.06614596562526459];
  /* مخططات البلاطات: نظامها، أصلها، دقة كل مستوى، ورابط البلاطة */
  const ESRI = { crs: "EPSG:3857", origin: [-HALF, HALF], res: z => 2 * HALF / 256 / Math.pow(2, z), maxZ: 19, url: (z, x, y) => "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x, name: "صورة Esri World Imagery" };
  const gmScheme = (svc, maxZ, tk, name) => ({ crs: "EPSG:28191", origin: [-4839400, 6616800], res: z => GM_RES[z], maxZ, url: (z, x, y) => GM + svc + "/MapServer/tile/" + z + "/" + y + "/" + x + (tk ? "?token=" + tk : ""), name });
  /* تحميل البلاطات بطابور (6 في نفس الوقت) — المهلة تبدأ عند الطلب الفعلي لا وهي تنتظر دورها،
     وإلا على شبكة الهاتف البطيئة تنتهي مهلة البلاطات وهي في الطابور فتفشل الصورة كلها */
  const Q = []; let active = 0;
  function pump() {
    while (active < 6 && Q.length) {
      const { url, res } = Q.shift(); active++;
      const i = new Image(); i.crossOrigin = "anonymous"; let done = false;
      const fin = v => { if (done) return; done = true; clearTimeout(t); active--; res(v); pump(); };
      const t = setTimeout(() => fin(null), 20000);
      i.onload = () => fin(i); i.onerror = () => fin(null); i.src = url;
    }
  }
  function tile(url) {
    if (!cache.has(url)) {
      const pr = new Promise(res => { Q.push({ url, res }); pump(); });
      cache.set(url, pr); pr.then(v => { if (!v) cache.delete(url); });   // الفاشلة لا تُحفظ، لتُعاد لاحقاً
      if (cache.size > 700) cache.delete(cache.keys().next().value);
    }
    return cache.get(url);
  }
  /* يرسم على ctx (W×H) المستطيل bbox بنظام sr من بلاطات المخطط S (تحويل أفيني دقيق للمناطق الصغيرة).
     يرجع {n, of}: عدد البلاطات المرسومة من المطلوبة */
  async function drawTiles(ctx, W, H, bbox, sr, S) {
    await ensureProj();
    const code = "EPSG:" + (sr || 28191), to = p => code === S.crs ? p : proj4(code, S.crs, p);
    const [x0, y0, x1, y1] = bbox.map(Number), rx = (x1 - x0) / W, ry = (y1 - y0) / H;
    const A = to([x0, y1]), B = to([x1, y1]), C = to([x0, y0]), D = to([x1, y0]);
    const e1 = [B[0] - A[0], B[1] - A[1]], e2 = [C[0] - A[0], C[1] - A[1]], det = e1[0] * e2[1] - e2[0] * e1[1];
    const M = [W * e2[1] / det, -W * e2[0] / det, -H * e1[1] / det, H * e1[0] / det];
    const scl = Math.hypot(e1[0], e1[1]) / (x1 - x0), want = Math.min(rx, ry) * scl;   // وحدات نظام البلاطات لكل بكسل
    const xs = [A[0], B[0], C[0], D[0]], ys = [A[1], B[1], C[1], D[1]], [ox0, oy0] = S.origin;
    let z = 0; while (z < S.maxZ && S.res(z + 1) >= want * 0.75) z++;
    if (S.res(z) > want && z < S.maxZ) z++;
    let tm, tx0, tx1, ty0, ty1;
    for (;; z--) {
      tm = 256 * S.res(z);
      tx0 = Math.floor((Math.min(...xs) - ox0) / tm); tx1 = Math.floor((Math.max(...xs) - ox0) / tm);
      ty0 = Math.floor((oy0 - Math.max(...ys)) / tm); ty1 = Math.floor((oy0 - Math.min(...ys)) / tm);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= (S.max || 60) || z <= 0) break;
    }
    const s = tm / 256, jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(tile(S.url(z, tx, ty)).then(im => ({ im, tx, ty })));
    const got = await Promise.all(jobs); let n = 0;
    for (const { im, tx, ty } of got) {
      if (!im) continue;
      const ox = ox0 + tx * tm - A[0], oy = oy0 - ty * tm - A[1];
      ctx.save(); ctx.setTransform(M[0] * s, M[2] * s, -M[1] * s, -M[3] * s, M[0] * ox + M[1] * oy, M[2] * ox + M[3] * oy);
      ctx.drawImage(im, 0, 0, 256.6, 256.6); ctx.restore(); n++;
    }
    return { n, of: got.length };
  }
  const drawEsriBox = async (ctx, W, H, bbox, sr) => (await drawTiles(ctx, W, H, bbox, sr, ESRI)).n;
  /* صورة جوية جاهزة (canvas) لمستطيل: بلاطات جيومولج السريعة (2025 ثم 2022) ثم Esri.
     opts.year: "2025" | "2024" | "2022" | "2021" | "2019" */
  const YEARS = { "2025": ["Orthophotos_WB_2025_15cm_tif_PG1923", 12, 1], "2024": ["Orthophotos_WB_2024_15cm_tif_PG1923", 12, 1], "2022": ["Orthophotos_WB_2022_15cm_tif_PG1923_05", 13, 0], "2021": ["Orthophotos_WB_2021_15cm_tif_PG1923", 13, 0], "2019": ["Orthophotos_WB_2019_Aerial_25cm_jpg_PG1923", 12, 0] };
  async function aerialImage(bbox, W, H, sr, opts) {
    opts = opts || {}; W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
    const order = [...new Set([opts.year || "2025", "2022"])].filter(y => YEARS[y]);
    let tk = "";
    if (order.some(y => YEARS[y][2]) && window.geoToken) { try { tk = await Promise.race([geoToken(), new Promise(r => setTimeout(() => r(""), 8000))]) || ""; } catch (e) {} }
    const tries = order.filter(y => !YEARS[y][2] || tk).map(y => gmScheme(YEARS[y][0], YEARS[y][1], YEARS[y][2] ? tk : "", "صورة جيومولج " + y)).concat(opts.noEsri ? [] : [ESRI]);
    for (const S of tries) {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      try { const r = await drawTiles(c.getContext("2d"), W, H, bbox, sr, S); if (r.n && r.n >= r.of * 0.6) return { img: c, name: S.name }; } catch (e) {}
    }
    return null;
  }
  async function esriImage(bbox, W, H, sr) {
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(W)); c.height = Math.max(1, Math.round(H));
    try { return (await drawEsriBox(c.getContext("2d"), c.width, c.height, bbox, sr)) > 0 ? c : null; } catch (e) { return null; }
  }
  window.drawEsriBox = drawEsriBox; window.esriImage = esriImage; window.aerialImage = aerialImage;
  window.esriBlob = async (bbox, W, H, sr) => { const c = await esriImage(bbox, W, H, sr); return c ? await new Promise(r => c.toBlob(r, "image/jpeg", 0.9)) : null; };
  window.aerialBlob = async (bbox, W, H, sr, opts) => { const a = await aerialImage(bbox, W, H, sr, opts); return a ? await new Promise(r => a.img.toBlob(r, "image/jpeg", 0.9)) : null; };
  /* طبقة Leaflet لخرائط نظام فلسطين (Proj4Leaflet) */
  if (window.L && L.GridLayer) window.EsriPGLayer = L.GridLayer.extend({
    createTile(c, done) {
      const t = document.createElement("canvas"); t.width = t.height = 256;
      const o = this._map.options.crs.options, r = o.resolutions[c.z], org = o.origin || [-4839400, 6616800];
      const x0 = org[0] + c.x * 256 * r, y1 = org[1] - c.y * 256 * r;
      drawEsriBox(t.getContext("2d"), 256, 256, [x0, y1 - 256 * r, x0 + 256 * r, y1], 28191).then(() => done(null, t), e => done(e, t));
      return t;
    }
  });
})();
