/* صورة جوية احتياطية (Esri World Imagery) لكل أدوات التطبيق عندما يتوقف خادم صور جيومولج.
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
  const T = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/";
  const HALF = 20037508.342789244, cache = new Map();
  function tile(z, x, y) {
    const k = z + "/" + y + "/" + x;
    if (!cache.has(k)) {
      cache.set(k, new Promise(res => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = T + k; }));
      if (cache.size > 600) cache.delete(cache.keys().next().value);
    }
    return cache.get(k);
  }
  /* يرسم على ctx بحجم W×H المستطيل bbox=[x0,y0,x1,y1] بنظام sr (28191 أو 2039). يرجع عدد البلاطات المرسومة */
  async function drawEsriBox(ctx, W, H, bbox, sr) {
    await ensureProj();
    const code = "EPSG:" + (sr || 28191), toWeb = p => proj4(code, "EPSG:3857", p);
    const [x0, y0, x1, y1] = bbox.map(Number), rx = (x1 - x0) / W, ry = (y1 - y0) / H;
    const A = toWeb([x0, y1]), B = toWeb([x1, y1]), C = toWeb([x0, y0]), D = toWeb([x1, y0]);
    const e1 = [B[0] - A[0], B[1] - A[1]], e2 = [C[0] - A[0], C[1] - A[1]], det = e1[0] * e2[1] - e2[0] * e1[1];
    const M = [W * e2[1] / det, -W * e2[0] / det, -H * e1[1] / det, H * e1[0] / det];
    const lat = proj4(code, "EPSG:4326", [(x0 + x1) / 2, (y0 + y1) / 2])[1] * Math.PI / 180, want = Math.min(rx, ry) / Math.cos(lat);
    const xs = [A[0], B[0], C[0], D[0]], ys = [A[1], B[1], C[1], D[1]];
    let z = Math.max(1, Math.min(19, Math.ceil(Math.log2(2 * HALF / 256 / want)))), tm, tx0, tx1, ty0, ty1;
    for (;; z--) {
      tm = 2 * HALF / Math.pow(2, z);
      tx0 = Math.floor((Math.min(...xs) + HALF) / tm); tx1 = Math.floor((Math.max(...xs) + HALF) / tm);
      ty0 = Math.floor((HALF - Math.max(...ys)) / tm); ty1 = Math.floor((HALF - Math.min(...ys)) / tm);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 120 || z <= 1) break;
    }
    const s = tm / 256, jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(tile(z, tx, ty).then(im => ({ im, tx, ty })));
    let n = 0;
    for (const { im, tx, ty } of await Promise.all(jobs)) {
      if (!im) continue;
      const ox = -HALF + tx * tm - A[0], oy = HALF - ty * tm - A[1];
      ctx.save(); ctx.setTransform(M[0] * s, M[2] * s, -M[1] * s, -M[3] * s, M[0] * ox + M[1] * oy, M[2] * ox + M[3] * oy);
      ctx.drawImage(im, 0, 0, 256.6, 256.6); ctx.restore(); n++;
    }
    return n;
  }
  /* صورة جاهزة (canvas) أو null */
  async function esriImage(bbox, W, H, sr) {
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(W)); c.height = Math.max(1, Math.round(H));
    try { return (await drawEsriBox(c.getContext("2d"), c.width, c.height, bbox, sr)) > 0 ? c : null; } catch (e) { return null; }
  }
  window.drawEsriBox = drawEsriBox; window.esriImage = esriImage;
  window.esriBlob = async (bbox, W, H, sr) => { const c = await esriImage(bbox, W, H, sr); return c ? await new Promise(r => c.toBlob(r, "image/jpeg", 0.9)) : null; };
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
