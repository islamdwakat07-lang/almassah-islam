/* الأرشيف – يحفظ نسخة من كل عمل في كل أداة، ولا يُحذف إلا إذا حذفه المستخدم.
   يُحمَّل في رأس كل صفحة قبل سكربت الأداة. التخزين في IndexedDB (سعة أكبر من localStorage). */
(function () {
  "use strict";
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); };
  const fmt = n => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  /* لكل أداة: اسمها، صورتها، صفحتها (من جذر التطبيق)، وكيف نعرف "هوية" العمل وعنوانه */
  const TOOLS = {
    "deed-shares-v4": { name: "حاسب الكواشين", img: "img/c-hisas.jpg", href: "index.html", info(d) {
      if (!d.owners || !d.owners.length) return null; const h = d.h || {};
      return { id: [h.vil, h.basin, h.parcel].join("|"), title: "كوشان " + ([h.vil, h.basin ? "حوض " + h.basin : "", h.parcel ? "قطعة " + h.parcel : ""].filter(Boolean).join(" – ") || "بدون اسم"), sub: d.owners.length + " مالك" };
    } },
    "ifraz-v1": { name: "الإفراز", img: "img/c-ifraz.jpg", href: "ifraz/index.html", info(d) {
      if (!Array.isArray(d.boundary) || d.boundary.length < 3 || d.sample) return null; const a = area(d.boundary);
      return { id: (d.landTitle || "") + "|" + Math.round(a), title: d.landTitle || "قطعة للإفراز", sub: fmt(a) + " م² · " + (d.owners || []).length + " مالك" };
    } },
    "geomolg-v1": { name: "GEO إسلام", img: "img/c-geomolg.jpg", href: "geomolg/index.html", info(d) {
      if (!d.vil) return null;
      return { id: [d.vil, d.blk, d.plot].join("|"), title: d.vil + (d.blk ? " – حوض " + String(d.blk).split("/")[0] : "") + (d.plot ? " – قطعة " + d.plot : ""), sub: "بحث قطعة" };
    } },
    "govmap-xy-v1": { name: "GOV إسلام", img: "img/c-govmap.jpg", href: "govmap/index.html", info(d) {
      if (!Array.isArray(d.hist) || !d.hist.length) return null;
      return { id: "hist", title: "سجل نقاط GOV", sub: d.hist.length + " نقطة · آخرها " + d.hist[0].x + " , " + d.hist[0].y };
    } },
    "khanzira-v1": { name: "الخنزيرة", img: "img/c-kh.jpg", href: "khanzira/index.html", info(d) {
      if (!d.file || !d.file.name) return null;
      return { id: d.file.name, title: "خنزيرة – " + d.file.name.replace(/\.dxf$/i, ""), sub: "ملف " + d.file.name };
    } },
    "level-v1": { name: "دفتر الليفل", img: "img/c-level.jpg", href: "level/index.html", info(d) {
      if (!d.bm || !Array.isArray(d.rows) || !d.rows.length) return null;
      return { id: String(d.t || d.bm.name + "|" + d.bm.z), title: "ميزانية من " + d.bm.name + " (" + Number(d.bm.z).toFixed(3) + ")", sub: d.rows.filter(r => r.k !== "BS").length + " قراءة · " + d.rows.filter(r => r.k === "BS").length + " محطات" };
    } },
    "cad-v1": { name: "أوتوكاد", img: "img/c-cad.jpg", href: "cad/index.html", info(d) {
      if (!d.name || !Array.isArray(d.ents) || !d.ents.length) return null;
      return { id: d.name + "|" + (d.t || ""), title: d.name, sub: d.ents.length + " عنصر" };
    } },
  };
  const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  const infoOf = (k, raw) => { const d = raw && parse(raw); if (!d || !TOOLS[k]) return null; try { return TOOLS[k].info(d); } catch (e) { return null; } };

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open("almassah-archive", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("items", { keyPath: "id" });
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const tx = (mode, fn) => db().then(d => new Promise((ok, no) => { const t = d.transaction("items", mode), s = t.objectStore("items"); const out = fn(s); t.oncomplete = () => ok(out && out.result !== undefined ? out.result : out); t.onerror = () => no(t.error); }));
  const get = id => tx("readonly", s => s.get(id));

  async function put(k, raw, inf) {
    inf = inf || infoOf(k, raw); if (!inf) return;
    const id = k + "::" + inf.id, now = Date.now();
    try {
      const old = await get(id);
      if (old && old.data === raw) return;
      await tx("readwrite", s => s.put({ id, key: k, tool: TOOLS[k].name, title: inf.title, sub: inf.sub, data: raw, size: raw.length, created: old ? old.created : now, updated: now }));
    } catch (e) {}
  }
  const snap = k => { try { const raw = localStorage.getItem(k); if (raw) return put(k, raw); } catch (e) {} };
  const snapAll = () => Promise.all(Object.keys(TOOLS).map(snap));

  /* كل حفظ في أداة يُنسخ للأرشيف بعد لحظات؛ وإذا بدأ عمل جديد يحل محل القديم، يُحفظ القديم فوراً قبل أن يضيع */
  const timers = {};
  try {
    const P = Storage.prototype, oSet = P.setItem, oDel = P.removeItem, oGet = P.getItem;
    P.setItem = function (k, v) {
      if (this === window.localStorage && TOOLS[k]) {
        try { const old = oGet.call(this, k); if (old && old !== v) { const a = infoOf(k, old), b = infoOf(k, String(v)); if (a && (!b || a.id !== b.id)) put(k, old, a); } } catch (e) {}
        clearTimeout(timers[k]); timers[k] = setTimeout(() => snap(k), 2500);
      }
      return oSet.call(this, k, v);
    };
    P.removeItem = function (k) {
      if (this === window.localStorage && TOOLS[k]) { try { const old = oGet.call(this, k); if (old) put(k, old); } catch (e) {} }
      return oDel.call(this, k);
    };
  } catch (e) {}
  addEventListener("pagehide", () => { Object.keys(timers).forEach(k => { clearTimeout(timers[k]); snap(k); }); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) Object.keys(timers).forEach(k => snap(k)); });

  window.Archive = {
    TOOLS, snapAll,
    list: () => tx("readonly", s => s.getAll()).then(a => (a || []).sort((x, y) => y.updated - x.updated)).catch(() => []),
    remove: id => tx("readwrite", s => s.delete(id)),
    /* يرجّع العمل للأداة ثم يفتحها. العمل المفتوح حالياً يُحفظ أولاً في الأرشيف */
    async open(id) { const it = await get(id); if (!it) return null; await snap(it.key); localStorage.setItem(it.key, it.data); clearTimeout(timers[it.key]); return TOOLS[it.key].href; },
    async exportAll() { const a = await this.list(); return JSON.stringify({ app: "almassah-archive", v: 1, at: new Date().toISOString(), items: a }); },
    async importAll(txt) {
      const o = parse(txt); if (!o || !Array.isArray(o.items)) throw new Error("bad");
      let n = 0; for (const it of o.items) { if (!it || !it.id || !TOOLS[it.key] || typeof it.data !== "string") continue; const old = await get(it.id); if (!old || old.updated < it.updated) { await tx("readwrite", s => s.put(it)); n++; } }
      return n;
    },
  };
})();
