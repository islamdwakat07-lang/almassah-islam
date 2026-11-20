/* لوحة المشاريع: عرض، إنشاء، تعديل الاسم، نسخ، حذف */
import { newProject, newId, ringOf, effectiveSetbacks, Project } from "../data/model";
import * as ops from "../data/ops";
import { analyzeParcel, bbox } from "../engine/geometry";
import { buildableZone } from "../engine/setbacks";
import { $, esc, fmt, timeAgo, sheet, toast, icon } from "./dom";

const STAGES = ["الأرض والارتدادات", "كتلة البناء", "الأعمدة", "التقسيم الداخلي", "الواجهات"];

function thumb(p: Project) {
  const r = ringOf(p);
  if (r.length < 2) return `<svg class="thumb" viewBox="0 0 320 200" aria-hidden="true"><text x="160" y="104" text-anchor="middle" fill="var(--faint)" font-size="13" font-family="IBM Plex Sans Arabic, sans-serif">لم تُرسم الأرض بعد</text></svg>`;
  const b = bbox(r), k = Math.min(260 / (b.w || 1), 150 / (b.h || 1)), ox = 160 - (b.x0 + b.x1) / 2 * k, oy = 100 + (b.y0 + b.y1) / 2 * k;
  const path = (ring: number[][]) => "M" + ring.map(q => `${(ox + q[0] * k).toFixed(1)} ${(oy - q[1] * k).toFixed(1)}`).join("L") + "Z";
  let zone = "";
  if (p.parcel.closed) { const a = analyzeParcel(r); if (a.valid) { const z = buildableZone(r, effectiveSetbacks(p), { join: p.rules.join, miterLimit: p.rules.miterLimit }); zone = z.parts.map(pt => `<path d="${path(pt.outer)}" fill="var(--zone-fill)" stroke="var(--zone)" stroke-width="1.2" stroke-dasharray="4 3"/>`).join(""); } }
  return `<svg class="thumb" viewBox="0 0 320 200" aria-hidden="true">${zone}<path d="${path(r)}" fill="none" stroke="var(--parcel)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

export async function openDashboard(root: HTMLElement, ctx: any) {
  root.innerHTML = `<div class="dash"><div class="dash-inner">
    <header class="brand">
      <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="11" fill="var(--ink-2)" stroke="var(--ink-4)"/><path d="M11 35 L17 13 L36 17 L33 35 Z" fill="none" stroke="var(--parcel)" stroke-width="2" stroke-linejoin="round"/><path d="M17.5 30 L21 18.5 L31 20.6 L29.4 30 Z" fill="var(--zone-fill)" stroke="var(--zone)" stroke-width="1.4" stroke-dasharray="3 2"/><circle cx="11" cy="35" r="2.4" fill="var(--brass)"/></svg>
      <div><h1>AI <b>Architect</b></h1><p>من حدود الأرض إلى تصميم البناء · المرحلة الأولى: الأرض والارتدادات</p></div>
      <span class="spacer"></span><span class="chip" id="where"><i></i>…</span>${ctx.inApp ? `<a class="btn" href="../home.html">الرئيسية</a>` : ""}
    </header>
    <div class="stage-strip" aria-label="مراحل المشروع">${STAGES.map((s, i) => `<span class="stage ${i ? "" : "now"}">${i + 1} · ${s}</span>`).join("")}</div>
    <section class="sect">
      <div class="dash-head"><h2>مشاريعي</h2><div class="row"><button class="btn" data-a="sample">افتح مشروع مثال</button><button class="btn primary" data-a="new">+ مشروع جديد</button></div></div>
      <div id="list" class="grid-cards" aria-live="polite"></div>
    </section>
  </div></div>`;

  const where = () => { const c = $("#where", root); if (!c) return; const k = ctx.store.repo.kind; c.className = "chip " + (k === "memory" ? "warn" : "ok"); c.innerHTML = `<i></i>${k === "cloud" ? "المشاريع محفوظة في حسابك" : k === "local" ? "المشاريع محفوظة على هذا الجهاز" : "التخزين مقفل: لن تُحفظ المشاريع"}`; };
  async function render() {
    where();
    let list: Project[] = []; try { list = await ctx.store.list(); } catch (e) { toast("تعذّر تحميل المشاريع"); }
    const L = $("#list", root); if (!L) return;
    const cards = list.map(p => {
      const r = ringOf(p), a = p.parcel.closed ? analyzeParcel(r) : null;
      return `<article class="pcard">${thumb(p)}
        <div class="body"><h3>${esc(p.name)}</h3>
          <div class="meta"><span>${a && a.valid ? `<span class="num">${fmt(a.area as number)}</span> م²` : p.parcel.vertices.length ? "الأرض غير مغلقة" : "بدون حدود"}</span><span>${p.parcel.vertices.length} رؤوس</span><span>${timeAgo(p.updatedAt)}</span></div>
          ${[p.meta.town, p.meta.block && "حوض " + p.meta.block, p.meta.parcel && "قطعة " + p.meta.parcel].filter(Boolean).length ? `<div class="meta">${esc([p.meta.town, p.meta.block && "حوض " + p.meta.block, p.meta.parcel && "قطعة " + p.meta.parcel].filter(Boolean).join(" · "))}</div>` : ""}
        </div>
        <button class="open" data-open="${p.id}" aria-label="افتح ${esc(p.name)}"></button>
        <div class="menu"><button class="icon-btn" data-menu="${p.id}" aria-label="خيارات ${esc(p.name)}">${icon.dots}</button></div>
      </article>`;
    }).join("");
    L.innerHTML = `<button class="newcard" data-a="new"><span class="plus">+</span>مشروع جديد</button>` + cards;
    if (!list.length) L.insertAdjacentHTML("beforeend", `<div class="empty"><h3>ابدأ بأول أرض</h3><p>أنشئ مشروعاً ثم ارسم حدود الأرض بالضغط على الرسم، أو استورد ملف DXF من أوتوكاد، أو الصق إحداثيات الرؤوس. بعدها تحدد ارتداد كل ضلع وتظهر لك المنطقة الصالحة للبناء.</p></div>`);
    (L as any)._list = list;
  }

  function newDialog() {
    sheet(`<form><h2>مشروع جديد</h2>
      <label class="field"><span>اسم المشروع</span><input class="input" id="nName" required autofocus placeholder="مثلاً: فيلا أبو أحمد"></label>
      <div class="defaults">
        <label class="field"><span>البلدة</span><input class="input" id="nTown"></label>
        <label class="field"><span>الحوض</span><input class="input" id="nBlock"></label>
        <label class="field"><span>القطعة</span><input class="input" id="nParcel"></label>
      </div>
      <div class="actions"><button class="btn primary" type="submit">أنشئ وابدأ الرسم</button><button class="btn ghost" type="button" data-act="cancel">إلغاء</button></div></form>`,
    (a: string, w: any) => {
      if (a !== "submit") return;
      const name = $("#nName", w).value.trim(); if (!name) { toast("اكتب اسماً للمشروع"); return false; }
      const p = newProject(name, { town: $("#nTown", w).value.trim(), block: $("#nBlock", w).value.trim(), parcel: $("#nParcel", w).value.trim() });
      ctx.store.create(p).then(() => ctx.go("p-" + p.id)).catch(() => toast("تعذّر حفظ المشروع"));
    });
  }
  async function sample() {
    // مثال واضح التسمية: أرض غير منتظمة بإحداثيات فلسطينية تقريبية
    let p = newProject("مثال – أرض غير منتظمة", { notes: "مشروع مثال للتجربة" });
    p = ops.setVertices(p, [[170412.35, 181025.62], [170441.9, 181019.18], [170447.2, 181046.75], [170431.05, 181049.4], [170433.8, 181061.3], [170410.6, 181064.85]], true, "مثال");
    p = ops.toggleStreet(p, 0);
    await ctx.store.create(p); ctx.go("p-" + p.id);
  }
  function menu(id: string) {
    const p: Project = (($("#list", root) as any)._list || []).find((x: Project) => x.id === id); if (!p) return;
    sheet(`<form><h2>${esc(p.name)}</h2>
      <label class="field"><span>الاسم</span><input class="input" id="rName" value="${esc(p.name)}"></label>
      <div class="actions"><button class="btn primary" type="submit">حفظ الاسم</button><button class="btn" type="button" data-act="dup">نسخة من المشروع</button><button class="btn danger" type="button" data-act="del">${icon.trash}حذف</button></div></form>`,
    (a: string, w: any) => {
      if (a === "submit") { const n = $("#rName", w).value.trim(); if (n) ctx.store.create(ops.rename(p, n)).then(render); }
      else if (a === "dup") { const q = JSON.parse(JSON.stringify(p)); q.id = newId(); q.name = p.name + " (نسخة)"; q.createdAt = q.updatedAt = Date.now(); ctx.store.create(q).then(render); }
      else if (a === "del") {
        setTimeout(() => sheet(`<h2>حذف «${esc(p.name)}»؟</h2><p class="note">يُحذف المشروع نهائياً ولا يمكن استرجاعه.</p><div class="actions"><button class="btn danger" data-act="yes">${icon.trash}احذف نهائياً</button><button class="btn ghost" data-act="no">إلغاء</button></div>`,
          (b: string) => { if (b === "yes") ctx.store.remove(p.id).then(() => { toast("حُذف المشروع"); render(); }); }), 0);
      }
    });
  }
  root.onclick = (e: any) => {
    const o = e.target.closest("[data-open]"); if (o) { ctx.go("p-" + o.dataset.open); return; }
    const m = e.target.closest("[data-menu]"); if (m) { menu(m.dataset.menu); return; }
    const b = e.target.closest("[data-a]"); if (!b) return;
    if (b.dataset.a === "new") newDialog(); else if (b.dataset.a === "sample") sample();
  };
  const off = ctx.store.on((ev: any) => { if (ev.type === "changed" || ev.type === "repo") render(); });
  await render();
  return () => { off(); root.onclick = null; };
}
