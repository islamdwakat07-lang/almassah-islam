/* صورة جوية احتياطية (Esri World Imagery) عندما يتوقف خادم صور جيومولج.
   بلاطات Esri بنظام Web Mercator تُرسم مُحوَّلة إلى نظام فلسطين (تحويل أفيني لكل منطقة صغيرة — دقته سنتيمترات) */
"use strict";
const ESRI_T = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/";
const WM_HALF = 20037508.342789244, esriCache = new Map();
function esriTile(z, x, y) {
  const k = z + "/" + y + "/" + x;
  if (!esriCache.has(k)) {
    esriCache.set(k, new Promise(res => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = ESRI_T + k; }));
    if (esriCache.size > 600) esriCache.delete(esriCache.keys().next().value);
  }
  return esriCache.get(k);
}
/* يرسم الصورة على ctx بحجم W×H لمستطيل نظام فلسطين bbox=[x0,y0,x1,y1] (الأعلى = y1). يرجع عدد البلاطات المرسومة */
async function drawEsriPG(ctx, W, H, bbox) {
  const [x0, y0, x1, y1] = bbox, rx = (x1 - x0) / W, ry = (y1 - y0) / H;
  const A = pgToWeb([x0, y1]), B = pgToWeb([x1, y1]), C = pgToWeb([x0, y0]), D = pgToWeb([x1, y0]);
  // مصفوفة من أمتار Web Mercator إلى بكسل الرسم
  const e1 = [B[0] - A[0], B[1] - A[1]], e2 = [C[0] - A[0], C[1] - A[1]], det = e1[0] * e2[1] - e2[0] * e1[1];
  const inv = [e2[1] / det, -e2[0] / det, -e1[1] / det, e1[0] / det];   // inverse of [e1 e2]
  const M = [W * inv[0], W * inv[1], H * inv[2], H * inv[3]];          // rows: u = M0*dx+M1*dy ; v = M2*dx+M3*dy
  const lat = proj4("EPSG:28191", "EPSG:4326", [(x0 + x1) / 2, (y0 + y1) / 2])[1] * Math.PI / 180;
  const want = Math.min(rx, ry) / Math.cos(lat);                         // أمتار Mercator لكل بكسل مطلوب
  const xs = [A[0], B[0], C[0], D[0]], ys = [A[1], B[1], C[1], D[1]];
  let z = Math.max(1, Math.min(19, Math.ceil(Math.log2(2 * WM_HALF / 256 / want)))), tm, tx0, tx1, ty0, ty1;
  for (;; z--) {   // لا نطلب أكثر من 120 بلاطة: نخفّض الدقة إن كانت المنطقة كبيرة
    tm = 2 * WM_HALF / Math.pow(2, z);
    tx0 = Math.floor((Math.min(...xs) + WM_HALF) / tm); tx1 = Math.floor((Math.max(...xs) + WM_HALF) / tm);
    ty0 = Math.floor((WM_HALF - Math.max(...ys)) / tm); ty1 = Math.floor((WM_HALF - Math.min(...ys)) / tm);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 120 || z <= 1) break;
  }
  const s = tm / 256;
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(esriTile(z, tx, ty).then(im => ({ im, tx, ty })));
  let n = 0;
  for (const { im, tx, ty } of await Promise.all(jobs)) {
    if (!im) continue;
    const ox = -WM_HALF + tx * tm - A[0], oy = WM_HALF - ty * tm - A[1];
    ctx.save();
    ctx.setTransform(M[0] * s, M[2] * s, -M[1] * s, -M[3] * s, M[0] * ox + M[1] * oy, M[2] * ox + M[3] * oy);
    ctx.drawImage(im, 0, 0, 256.6, 256.6);   // تداخل بسيط يمنع الخطوط بين البلاطات
    ctx.restore(); n++;
  }
  return n;
}
/* طبقة لخريطة Leaflet بنظام فلسطين */
const EsriPGLayer = L.GridLayer.extend({
  createTile(c, done) {
    const t = document.createElement("canvas"); t.width = t.height = 256;
    const r = this._map.options.crs.options.resolutions[c.z], x0 = -4839400 + c.x * 256 * r, y1 = 6616800 - c.y * 256 * r;
    drawEsriPG(t.getContext("2d"), 256, 256, [x0, y1 - 256 * r, x0 + 256 * r, y1]).then(() => done(null, t), e => done(e, t));
    return t;
  }
});
