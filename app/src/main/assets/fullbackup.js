/* النسخة الاحتياطية الشاملة لتطبيق «المهندس إسلام»
   ملف واحد (.almassah) فيه كل بيانات كل الأدوات: كل ما في localStorage، وكل قواعد IndexedDB
   (أوراق المواطنين وصورها، سجل إسلام، الأرشيف، …) — تُكتشف تلقائياً، فأي أداة جديدة تدخل في النسخة بدون تعديل.
   الصيغة: AMBK1 + طول الرأس (12 رقم) + رأس JSON + محتوى الصور والملفات متتابعاً.
   الاسترجاع يقبل أيضاً نسخة «أوراق المواطنين» القديمة (.awraq) ونسخة الأرشيف (.json). */
(function () {
  "use strict";
  const KNOWN_DBS = ["awraq-almuwatinin", "segl-aslam", "almassah-archive"];
  const AWRQ_SCHEMA = { "awraq-almuwatinin": { v: 1, stores: { citizens: "id", pages: "id" } }, "segl-aslam": { v: 1, stores: { customers: "id", notes: "id" } } };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const b64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1] || ""); f.onerror = rej; f.readAsDataURL(blob); });
  const pad = n => String(n).padStart(2, "0");

  async function dbNames() {
    let names = [];
    try { if (indexedDB.databases) names = (await indexedDB.databases()).map(d => d.name).filter(Boolean); } catch (e) {}
    return [...new Set(names.concat(KNOWN_DBS))];
  }
  /* يفتح القاعدة إن كانت موجودة فقط (لا ينشئ قاعدة فارغة) */
  function openExisting(name) {
    return new Promise(res => {
      let created = false; const r = indexedDB.open(name);
      r.onupgradeneeded = () => { created = true; };
      r.onsuccess = () => { const db = r.result; if (created || !db.objectStoreNames.length) { db.close(); if (created) indexedDB.deleteDatabase(name); res(null); } else res(db); };
      r.onerror = () => res(null);
    });
  }

  async function make(progress) {
    const blobs = [];
    const enc = v => {
      if (v instanceof Blob) { blobs.push(v); return { $blob: blobs.length - 1, t: v.type }; }
      if (v instanceof ArrayBuffer) { blobs.push(new Blob([v])); return { $ab: blobs.length - 1 }; }
      if (ArrayBuffer.isView(v)) { blobs.push(new Blob([v])); return { $ab: blobs.length - 1, view: v.constructor.name }; }
      if (v instanceof Date) return { $date: v.getTime() };
      if (Array.isArray(v)) return v.map(enc);
      if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = enc(v[k]); return o; }
      return v;
    };
    const ls = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== "pendingPick") ls[k] = localStorage.getItem(k); } } catch (e) {}
    const dbs = []; let nrec = 0;
    for (const name of await dbNames()) {
      progress && progress("…قراءة " + name);
      const db = await openExisting(name); if (!db) continue;
      const D = { name, version: db.version, stores: [] };
      for (const sn of Array.from(db.objectStoreNames)) {
        const st = db.transaction(sn, "readonly").objectStore(sn);
        const S = { name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, indexes: Array.from(st.indexNames).map(i => { const x = st.index(i); return { name: x.name, keyPath: x.keyPath, unique: x.unique, multiEntry: x.multiEntry }; }) };
        const vals = await req(db.transaction(sn, "readonly").objectStore(sn).getAll());
        S.values = enc(vals); nrec += vals.length;
        if (st.keyPath == null) S.keys = await req(db.transaction(sn, "readonly").objectStore(sn).getAllKeys());
        D.stores.push(S);
      }
      db.close(); dbs.push(D);
    }
    const head = new TextEncoder().encode(JSON.stringify({ app: "almassah", v: 1, created: Date.now(), ls, dbs, sizes: blobs.map(b => b.size) }));
    const file = new Blob([new TextEncoder().encode("AMBK1" + String(head.length).padStart(12, "0")), head, ...blobs], { type: "application/octet-stream" });
    return { file, nls: Object.keys(ls).length, nrec, nfiles: blobs.length, ndb: dbs.length };
  }

  async function save(file, name, progress) {
    const A = window.AndroidBridge;
    if (A && A.saveBegin) {
      if (!A.saveBegin(name, "application/octet-stream")) throw new Error("تعذّر إنشاء الملف في التنزيلات");
      const CH = 3 * 1024 * 1024;
      for (let o = 0; o < file.size; o += CH) { progress && progress(`…حفظ النسخة ${Math.round(o * 100 / file.size)}%`); if (!A.saveChunk(await b64(file.slice(o, o + CH)))) throw new Error("تعذّرت الكتابة (المساحة ممتلئة؟)"); }
      A.saveEnd(name); return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  /* يفتح القاعدة ويضمن وجود المخازن (ينشئها إن نقصت) */
  async function ensureDb(name, version, stores) {
    const openV = v => new Promise((res, rej) => { const r = v ? indexedDB.open(name, v) : indexedDB.open(name);
      r.onupgradeneeded = e => { const d = r.result;
        if (!v && e.oldVersion === 0 && (version || 1) > 1) { r.transaction.abort(); return; }   // قاعدة جديدة: تُنشأ بنفس رقم نسختها الأصلي
        for (const s of stores) if (!d.objectStoreNames.contains(s.name)) mk(d, s); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => {}; });
    let db = await openV(0);
    if (db && !db.objectStoreNames.length) {   // قاعدة فارغة: نعيد إنشاءها برقم نسختها الأصلي حتى تفتحها أداتها
      db.close(); await new Promise(r => { const q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = () => r(); }); db = null; }
    if (!db) db = await openV(version || 1);
    if (!db) throw new Error("تعذّر فتح " + name);
    const missing = stores.filter(s => !db.objectStoreNames.contains(s.name));
    if (!missing.length) return db;
    const v = db.version + 1; db.close();
    db = await openV(v); if (!db) throw new Error("تعذّر تجهيز " + name); return db;
  }
  function mk(d, s) { const o = d.createObjectStore(s.name, { keyPath: s.keyPath == null ? undefined : s.keyPath, autoIncrement: !!s.autoIncrement }); (s.indexes || []).forEach(i => { try { o.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry }); } catch (e) {} }); }
  const put = (db, sn, val, key) => new Promise((res, rej) => { const t = db.transaction(sn, "readwrite"); const st = t.objectStore(sn); key === undefined ? st.put(val) : st.put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

  async function restore(f, progress) {
    const txt = async (a, b) => new TextDecoder().decode(await f.slice(a, b).arrayBuffer());
    const mg = await txt(0, 17);
    if (/^\s*[\[{]/.test(mg)) { if (!window.Archive || !Archive.importAll) throw new Error("ملف أرشيف غير مدعوم هنا"); const n = await Archive.importAll(await f.text()); return { kind: "json", n }; }
    const kind = mg.startsWith("AMBK1") ? "full" : mg.startsWith("AWRQ1") ? "awraq" : null;
    if (!kind) throw new Error("هذا ليس ملف نسخة احتياطية من المهندس إسلام");
    const hl = +mg.slice(5), H = JSON.parse(await txt(17, 17 + hl)), offs = []; let o = 17 + hl;
    for (const z of H.sizes) { offs.push(o); o += z; }
    if (o > f.size) throw new Error("الملف ناقص (لم يكتمل نسخه أو إرساله)");
    const part = async i => await f.slice(offs[i], offs[i] + H.sizes[i]).arrayBuffer();
    const dec = async v => {
      if (Array.isArray(v)) { const r = []; for (const x of v) r.push(await dec(x)); return r; }
      if (v && typeof v === "object") {
        if ("$blob" in v) return new Blob([await part(v.$blob)], { type: v.t || "" });
        if ("$ab" in v) { const ab = await part(v.$ab); return v.view && self[v.view] ? new self[v.view](ab) : ab; }
        if ("$date" in v) return new Date(v.$date);
        const r = {}; for (const k in v) r[k] = await dec(v[k]); return r;
      }
      return v;
    };
    // توحيد الصيغتين: [{name, version, stores:[{name,keyPath,values,keys}]}]
    let dbs;
    if (kind === "full") dbs = H.dbs;
    else dbs = Object.entries(H.dbs || {}).map(([name, st]) => { const S = AWRQ_SCHEMA[name] || { v: 1, stores: {} }; return { name, version: S.v, stores: Object.entries(st).map(([sn, vals]) => ({ name: sn, keyPath: S.stores[sn] || "id", autoIncrement: false, indexes: [], values: vals })) }; });
    let tot = 0, n = 0; dbs.forEach(d => d.stores.forEach(s => tot += (s.values || []).length));
    for (const D of dbs) {
      const db = await ensureDb(D.name, D.version, D.stores);
      for (const S of D.stores) { const vals = S.values || [];
        for (let i = 0; i < vals.length; i++) { await put(db, S.name, await dec(vals[i]), S.keyPath == null && S.keys ? S.keys[i] : undefined); if (++n % 10 === 0 && progress) progress(`…استرجاع ${Math.round(n * 100 / Math.max(1, tot))}%`); } }
      db.close();
    }
    // localStorage: النسخة الشاملة تستبدل بيانات الأدوات بنسختها، ونسخة الأوراق لا تكتب إلا الناقص
    let nls = 0;
    try { for (const k in H.ls || {}) { if (k === "pendingPick") continue; if (kind === "full" || localStorage.getItem(k) == null) { localStorage.setItem(k, H.ls[k]); nls++; } } } catch (e) {}
    return { kind, n, nls, created: H.created };
  }

  function fileName() { const d = new Date(); return `نسخة المهندس إسلام ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}.almassah`; }
  window.FullBackup = { make, save, restore, fileName };
})();
