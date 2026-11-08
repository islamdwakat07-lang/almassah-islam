/* GeoMOLG changes its access key from time to time. This fetches the current key from GeoMOLG's own
   public parcel-search site and keeps it for a few hours, so protected layers (2024/2025 photos,
   Land Authority parcels, agricultural value…) keep working. */
(function () {
  const KEY = "geomolg-token-v1", SRC = "https://geomolg.ps/Geocortex/Essentials/REST/sites/ParcelSearch/map?f=json";
  const SRC2 = "https://geomolg.ps/Geocortex/Essentials/REST/sites/A3/map?f=json";
  const TEST = "https://orthophotos.geomolg.ps/adaptor/rest/services/Parcels_All_PLA/MapServer?f=json&token=";
  const cbs = {}; let seq = 0;
  function hook() {   // chain onto the page's own native-http callback (installed at call time, so page scripts may load later)
    if (window.onNativeHttp && window.onNativeHttp.__tk) return;
    const prev = window.onNativeHttp;
    const f = (id, status, text) => { if (cbs[id]) { const c = cbs[id]; delete cbs[id]; c({ status, text: String(text || "") }); } else if (prev) prev(id, status, text); };
    f.__tk = 1; window.onNativeHttp = f;
  }
  function get(url) {
    hook();
    if (window.AndroidBridge && AndroidBridge.httpGet) return new Promise((ok, no) => { const id = "tk" + (++seq); cbs[id] = r => r.status === -1 ? no(new Error(r.text)) : ok(r); try { AndroidBridge.httpGet(id, url, false); } catch (e) { delete cbs[id]; no(e); } });
    return fetch(url).then(async r => ({ status: r.status, text: await r.text() }));
  }
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const pick = txt => { const m = String(txt).match(/orthophotos\.geomolg\.ps[^"]*?token=([A-Za-z0-9_\-.]+)/); return m ? m[1] : null; };
  async function valid(t) { try { const r = await get(TEST + encodeURIComponent(t)); return r.status === 200 && !/"error"/.test(r.text.slice(0, 200)); } catch (e) { return false; } }
  let pending = null;
  async function fresh() {
    for (const u of [SRC, SRC2]) { try { const r = await get(u); const t = pick(r.text); if (t) { try { localStorage.setItem(KEY, JSON.stringify({ t, at: Date.now() })); } catch (e) {} return t; } } catch (e) {} }
    return null;
  }
  /* returns a working token (cached up to 6 h, checked when older than 20 min) */
  window.geoToken = function (force) {
    if (pending) return pending;
    pending = (async () => {
      const c = read();
      if (!force && c && c.t && Date.now() - c.at < 8 * 60e3) return c.t;
      if (!force && c && c.t && Date.now() - c.at < 6 * 3600e3 && await valid(c.t)) { try { localStorage.setItem(KEY, JSON.stringify({ t: c.t, at: Date.now() })); } catch (e) {} return c.t; }
      return (await fresh()) || (c && c.t) || "";
    })().finally(() => { setTimeout(() => { pending = null; }, 0); });
    return pending;
  };
  window.geoTokenNow = () => { const c = read(); return c && c.t || ""; };
})();
