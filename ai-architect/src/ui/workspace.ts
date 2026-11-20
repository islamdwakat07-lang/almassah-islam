/**
 * مساحة العمل: أربع خطوات للهاوي (الأرض ← الشارع ← الاشتراطات ← النتيجة) فوق رسم هندسي تفاعلي.
 * الواجهة فقط: الحسابات من المحرك، والحفظ من طبقة البيانات.
 */
import { analyzeParcel, bbox, closestOnSeg, dist, ParcelInfo, Pt } from "../engine/geometry";
import { buildableZone, ZoneResult } from "../engine/setbacks";
import { verifyZone } from "../engine/verify";
import { explain, Explanation } from "../engine/explain";
import { countStreets } from "../engine/classify";
import { parseDXF, UNIT_NAMES } from "../io/dxf-read";
import { parseCoords } from "../io/coords";
import { exportDXF } from "../io/export";
import { readClipboard } from "../io/platform";
import { Project, ringOf, effectiveSetbacks, TYPE_LABEL, Rules } from "../data/model";
import * as ops from "../data/ops";
import { History } from "../data/history";
import { listProfiles, saveProfile, deleteProfile } from "../data/profiles";
import { Viewport, niceStep } from "./viewport";
import { $, $$, esc, fmt, fmtCoord, fmtDMS, readNum, toast, sheet, icon } from "./dom";

const TYPE_COLOR: Record<string, string> = { front: "var(--front)", side: "var(--side)", back: "var(--back)" };
const HIT = 18;
type Step = "land" | "street" | "rules" | "result";
const STEPS: Array<[Step, string]> = [["land", "الأرض"], ["street", "الشارع"], ["rules", "الاشتراطات"], ["result", "النتيجة"]];

export function openWorkspace(root: HTMLElement, project: Project, ctx: any) {
  let P = project, info: ParcelInfo | null = null, zone: ZoneResult | null = null, ex: Explanation | null = null, ver: any = null;
  let sel: { kind: "vertex" | "edge"; i: number } | null = null, cursor: Pt | null = null;
  let tool: "select" | "draw" | "pan" = P.parcel.closed ? "select" : "draw", showAngles = false;
  let step: Step = !P.parcel.closed ? "land" : !P.streets.length ? "street" : "result";
  const hist = new History<Project>(), vp = new Viewport();

  root.innerHTML = `
  <div class="ws">
    <header class="topbar">
      <button class="icon-btn" data-a="home" title="المشاريع" aria-label="رجوع إلى المشاريع">${icon.back}</button>
      <div class="title"><input id="pname" value="${esc(P.name)}" aria-label="اسم المشروع"><small id="saveState">محفوظ</small></div>
      <button class="icon-btn" data-a="undo" title="تراجع (Ctrl+Z)" aria-label="تراجع">${icon.undo}</button>
      <button class="icon-btn" data-a="redo" title="إعادة (Ctrl+Y)" aria-label="إعادة">${icon.redo}</button>
      <span class="sep hide-sm"></span>
      <button class="btn hide-sm" data-a="import">${icon.upload}استيراد DXF</button>
      <button class="btn primary" data-a="export">${icon.download}<span>تصدير DXF</span></button>
    </header>
    <nav class="steps" id="steps" aria-label="خطوات المشروع"></nav>
    <div class="main">
      <div class="canvas-wrap" id="cw">
        <svg class="scene" id="scene" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="toolbox" role="toolbar" aria-label="أدوات الرسم">
          <button class="icon-btn" data-tool="select" title="تحديد وتعديل" aria-label="تحديد وتعديل">${icon.select}</button>
          <button class="icon-btn" data-tool="draw" title="رسم الأرض" aria-label="رسم الأرض">${icon.draw}</button>
          <button class="icon-btn" data-tool="pan" title="تحريك العرض" aria-label="تحريك العرض">${icon.pan}</button>
          <hr>
          <button class="icon-btn" data-a="zin" title="تكبير" aria-label="تكبير">${icon.zoomIn}</button>
          <button class="icon-btn" data-a="zout" title="تصغير" aria-label="تصغير">${icon.zoomOut}</button>
          <button class="icon-btn" data-a="fit" title="عرض الأرض كاملة" aria-label="عرض الكل">${icon.fit}</button>
          <button class="icon-btn" data-a="angles" title="إظهار الزوايا" aria-label="إظهار الزوايا" aria-pressed="false">${icon.angle}</button>
        </div>
        <div class="drawbar" id="drawbar" hidden></div>
        <div class="hud"><div class="coordbox" id="scale"></div><div class="coordbox" id="coords">X — · Y —</div></div>
      </div>
      <aside class="panel" id="panel">
        <button class="grabber" id="grab" aria-label="اسحب لتكبير أو تصغير اللوحة"><i></i><small>اسحب ↕</small></button>
        <div class="panel-body" id="pbody"></div>
      </aside>
    </div>
    <input type="file" id="dxfIn" accept=".dxf,application/dxf,image/vnd.dxf,text/plain,*/*" hidden>
  </div>`;

  const svg = $("#scene", root) as SVGSVGElement, cw = $("#cw", root), pbody = $("#pbody", root), panel = $("#panel", root);

  /* ---------- الحساب ---------- */
  function compute() {
    const r = ringOf(P);
    info = P.parcel.closed ? analyzeParcel(r) : null;
    zone = info && info.valid ? buildableZone(r, effectiveSetbacks(P), { join: P.rules.join, miterLimit: P.rules.miterLimit }) : null;
    ver = zone && zone.ok ? verifyZone(r, zone, 0.1) : null;
    ex = zone ? explain(zone, P.edges.map(e => e.type), countStreets(r, P.streets), P.rules.coverage, P.rules.maxFloors, ver) : null;
  }
  function commit(next: Project, record = true) {
    if (!next || next === P) return;
    if (record) hist.push(P);
    P = next; compute(); renderAll(); ctx.store.save(P);
  }
  function jump(s: Project | null, what: string) { if (!s) return toast(what); P = s; sel = null; if (!P.parcel.closed) tool = "draw"; else if (tool === "draw") tool = "select"; compute(); renderAll(); ctx.store.save(P); $("#pname", root).value = P.name; }
  const undo = () => jump(hist.undo(P), "لا يوجد ما يُتراجع عنه");
  const redo = () => jump(hist.redo(P), "لا يوجد ما يُعاد");

  const offStore = ctx.store.on((ev: any) => {
    if (ev.type !== "status") return;
    const s = $("#saveState", root); if (!s) return;
    const where = ctx.store.repo.kind === "cloud" ? "في حسابك" : ctx.store.repo.kind === "local" ? "على هذا الجهاز" : "مؤقتاً (التخزين مقفل)";
    s.textContent = ev.status === "saving" ? "جارٍ الحفظ…" : ev.status === "saved" ? `محفوظ تلقائياً ${where}` : "تعذّر الحفظ، سأعيد المحاولة مع التعديل التالي";
    s.style.color = ev.status === "error" ? "var(--danger)" : "";
  });

  /* ---------- لوحة الهاتف: تُسحب للأعلى والأسفل (صغيرة / نصف / كامل الشاشة) ---------- */
  const mainEl = $(".main", root) as HTMLElement, grab = $("#grab", root) as HTMLElement;
  const MINH = 112;
  const snaps = () => { const H = mainEl.clientHeight; return [MINH, Math.round(H * 0.46), Math.max(MINH, H - 6)]; };
  function setSheet(h: number, anim = true) {
    const [lo, , hi] = snaps(); h = Math.max(lo, Math.min(hi, h));
    panel.style.transition = anim ? "" : "none";
    mainEl.style.setProperty("--sheet-h", h + "px");
    panel.classList.toggle("min", h <= lo + 1);
    panel.classList.toggle("full", h >= hi - 1);
  }
  let sdrag: { y: number; h: number; moved: boolean; t: number; lastY: number } | null = null;
  grab.addEventListener("pointerdown", (e: PointerEvent) => { sdrag = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false, t: e.timeStamp, lastY: e.clientY }; grab.setPointerCapture(e.pointerId); e.preventDefault(); });
  grab.addEventListener("pointermove", (e: PointerEvent) => {
    if (!sdrag) return; const dy = sdrag.y - e.clientY;
    if (Math.abs(dy) > 5) sdrag.moved = true;
    if (sdrag.moved) { panel.classList.remove("min"); setSheet(sdrag.h + dy, false); }
    sdrag.lastY = e.clientY;
  });
  const endSheet = (e: PointerEvent) => {
    if (!sdrag) return; const d = sdrag; sdrag = null; const s = snaps(); const cur = panel.getBoundingClientRect().height;
    if (!d.moved) { setSheet(cur <= s[0] + 1 ? s[1] : cur >= s[2] - 1 ? s[1] : s[2]); return; }   // ضغطة: تكبير/تصغير
    const v = (d.y - e.clientY) / Math.max(1, e.timeStamp - d.t);                                   // سرعة السحب
    if (Math.abs(v) > 0.6) { setSheet(v > 0 ? s.find((x) => x > cur + 4) ?? s[2] : [...s].reverse().find((x) => x < cur - 4) ?? s[0]); return; }
    setSheet(s.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a)));
  };
  grab.addEventListener("pointerup", endSheet); grab.addEventListener("pointercancel", endSheet);

  /* ---------- الرسم ---------- */
  function resize() { const r = cw.getBoundingClientRect(); vp.setSize(r.width, r.height); }
  const sheetInset = () => (matchMedia("(max-width: 860px)").matches ? panel.getBoundingClientRect().height : 0);
  function fitView() {
    resize(); const r = ringOf(P);
    if (r.length >= 2) vp.fit(bbox(r), 44, sheetInset(), 64);
    else if (r.length === 1) { vp.cx = r[0][0]; vp.cy = r[0][1]; vp.s = 10; }
    else { vp.cx = 0; vp.cy = 0; vp.s = Math.min(vp.W, vp.H) / 60; }
    renderScene();
  }
  function label(x: number, y: number, t: string, color: string, rot = 0, fs = 11.5) {
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" font-family="IBM Plex Mono, IBM Plex Sans Arabic, monospace" font-weight="600" fill="${color}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="var(--ink-0)" stroke-width="3.5" stroke-linejoin="round" ${rot ? `transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"` : ""} style="direction:ltr;unicode-bidi:isolate">${esc(t)}</text>`;
  }
  function renderScene() {
    const W = vp.W, H = vp.H, T = (x: number, y: number) => vp.toScreen(x, y), r = ringOf(P) as Pt[], n = r.length, out: string[] = [];
    const step0 = niceStep(vp.s), [x0, y1] = vp.toWorld(0, 0), [x1, y0] = vp.toWorld(W, H);
    for (const major of [false, true]) {
      let d = "";
      for (let v = Math.ceil(x0 / step0) * step0; v <= x1; v += step0) { const m = Math.abs(v / (step0 * 5) - Math.round(v / (step0 * 5))) < 1e-6; if (m !== major) continue; d += `M${T(v, 0)[0].toFixed(1)} 0V${H}`; }
      for (let v = Math.ceil(y0 / step0) * step0; v <= y1; v += step0) { const m = Math.abs(v / (step0 * 5) - Math.round(v / (step0 * 5))) < 1e-6; if (m !== major) continue; d += `M0 ${T(0, v)[1].toFixed(1)}H${W}`; }
      out.push(`<path d="${d}" stroke="${major ? "var(--grid-major)" : "var(--grid)"}" stroke-width="1" fill="none"/>`);
    }
    const path = (ring: Pt[]) => "M" + ring.map(p => T(p[0], p[1]).map(v => v.toFixed(2)).join(" ")).join("L") + "Z";
    if (n >= 3 && P.parcel.closed) out.push(`<path d="${path(r)}" fill="rgba(243,234,216,.035)"/>`);
    if (zone && zone.parts.length) out.push(`<path d="${zone.parts.map(pt => [pt.outer, ...pt.holes].map(path).join("")).join("")}" fill="var(--zone-fill)" fill-rule="evenodd" stroke="var(--zone)" stroke-width="1.6" stroke-dasharray="7 5"/>`);
    const cross = new Set((info && info.issues[0] && info.issues[0].pairs ? info.issues[0].pairs.flat() : []) as number[]);
    for (let i = 0; i < (P.parcel.closed ? n : n - 1); i++) {
      const a = T(...r[i]), b = T(...r[(i + 1) % n]), isSel = sel && sel.kind === "edge" && sel.i === i, e = P.edges[i];
      const street = P.parcel.closed && P.streets.includes(i);
      if (street) out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--front)" stroke-opacity=".35" stroke-width="12" stroke-linecap="round"/>`);
      const col = cross.has(i) ? "var(--danger)" : isSel ? "var(--brass-2)" : P.parcel.closed && step !== "land" && e ? TYPE_COLOR[e.type] : "var(--parcel)";
      out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${col}" stroke-width="${isSel ? 3.6 : 2.2}" stroke-linecap="round"/>`);
      if (step === "street" && P.parcel.closed) out.push(`<line data-e="${i}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="transparent" stroke-width="26" style="cursor:pointer"/>`);
    }
    if (!P.parcel.closed && tool === "draw" && n && cursor) {
      const a = T(...r[n - 1]), c = T(...cursor);
      out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}" stroke="var(--brass)" stroke-width="1.6" stroke-dasharray="5 4"/>`);
      out.push(label((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 10, fmt(dist(r[n - 1], cursor)), "var(--brass-2)"));
    }
    if (P.parcel.closed && n >= 3) {
      const ccw = info ? !!info.ccw : true, sb = effectiveSetbacks(P);
      for (let i = 0; i < n; i++) {
        const A = r[i], B = r[(i + 1) % n], a = T(...A), b = T(...B), len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 34) continue;
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        let nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len; if (!ccw) { nx = -nx; ny = -ny; } nx = -nx; ny = -ny;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        out.push(label(mx + nx * 18, my + ny * 18, fmt(dist(A, B)), "var(--text)", ang));
        if (P.streets.includes(i) && len > 60) out.push(label(mx + nx * 34, my + ny * 34, "شارع", "var(--front)", ang, 11));
        const e = P.edges[i];
        if (e && sb[i] > 0 && len > 70 && step !== "land") {
          const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, ox = mx + tx * 26, oy = my + ty * 26, L = sb[i] * vp.s, col = TYPE_COLOR[e.type];
          out.push(`<line x1="${ox}" y1="${oy}" x2="${ox - nx * L}" y2="${oy - ny * L}" stroke="${col}" stroke-width="1.4"/><circle cx="${ox - nx * L}" cy="${oy - ny * L}" r="2.2" fill="${col}"/>`);
          out.push(label(ox - nx * Math.max(L / 2, 12) + tx * 18, oy - ny * Math.max(L / 2, 12) + ty * 18, fmt(sb[i]), col, ang, 10.5));
        }
      }
    }
    if (P.parcel.closed && tool === "select" && step === "land") for (let i = 0; i < n; i++) {
      const a = T(...r[i]), b = T(...r[(i + 1) % n]); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 60) continue;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      out.push(`<g data-mid="${i}"><circle cx="${m[0]}" cy="${m[1]}" r="14" fill="transparent"/><circle cx="${m[0]}" cy="${m[1]}" r="7" fill="var(--ink-1)" stroke="var(--muted)" stroke-width="1.2"/><path d="M${m[0] - 3.5} ${m[1]}h7M${m[0]} ${m[1] - 3.5}v7" stroke="var(--muted)" stroke-width="1.4"/></g>`);
    }
    if (showAngles && info && info.angles && info.centroid) r.forEach((p, i) => {
      const s = T(...p), cc = T(...(info as ParcelInfo).centroid as Pt), dd = Math.hypot(cc[0] - s[0], cc[1] - s[1]) || 1;
      out.push(label(s[0] + (cc[0] - s[0]) / dd * 30, s[1] + (cc[1] - s[1]) / dd * 30, fmtDMS((info as any).angles[i]), "var(--custom)", 0, 10.5));
    });
    r.forEach((p, i) => {
      const s = T(...p), isSel = sel && sel.kind === "vertex" && sel.i === i, first = !P.parcel.closed && i === 0 && n >= 3 && tool === "draw";
      out.push(`<g data-v="${i}"><circle cx="${s[0]}" cy="${s[1]}" r="${HIT}" fill="transparent"/>` + (first ? `<circle cx="${s[0]}" cy="${s[1]}" r="12" fill="none" stroke="var(--brass)" stroke-width="1.5" stroke-dasharray="3 3"/>` : "") +
        `<circle cx="${s[0]}" cy="${s[1]}" r="${isSel ? 7 : 5.5}" fill="${isSel ? "var(--brass)" : "var(--ink-0)"}" stroke="${isSel ? "var(--brass-2)" : "var(--parcel)"}" stroke-width="2"/>` +
        `<text x="${s[0] + 9}" y="${s[1] - 9}" font-size="11" font-family="IBM Plex Mono, monospace" fill="var(--muted)" font-weight="600">${i + 1}</text></g>`);
    });
    out.push(`<g transform="translate(${W - 32},${56})" opacity=".8"><path d="M0 -16 L6 6 L0 2 L-6 6Z" fill="var(--parcel)"/><text y="20" font-size="11" text-anchor="middle" fill="var(--muted)" font-family="IBM Plex Mono, monospace">N</text></g>`);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = out.join("");
    const sb = niceStep(vp.s, 90);
    $("#scale", root).innerHTML = `<span style="display:inline-block;width:${(sb * vp.s).toFixed(0)}px;height:6px;border:1.5px solid var(--muted);border-top:0;vertical-align:middle;margin-inline-end:8px"></span>${sb >= 1 ? sb + " m" : (sb * 100).toFixed(0) + " cm"}`;
  }

  /* ---------- الخطوات واللوحة ---------- */
  function stepState(s: Step): "done" | "now" | "todo" | "locked" {
    if (s === step) return "now";
    if (s === "land") return P.parcel.closed && info && info.valid ? "done" : "todo";
    if (!P.parcel.closed || !(info && info.valid)) return "locked";
    if (s === "street") return P.streets.length ? "done" : "todo";
    if (s === "rules") return "done";
    return "todo";
  }
  function renderSteps() {
    $("#steps", root).innerHTML = STEPS.map(([k, t], i) => { const st = stepState(k); return `<button data-step="${k}" class="st ${st}" ${st === "locked" ? "disabled" : ""} aria-current="${k === step ? "step" : "false"}"><b>${st === "done" ? "✓" : i + 1}</b><span>${t}</span></button>`; }).join("");
  }
  let pending = false;
  function renderPanel() {
    if (pbody.contains(document.activeElement) && (document.activeElement as any).matches("input,select,textarea")) { pending = true; return; }
    pending = false;
    pbody.innerHTML = step === "land" ? landStep() : step === "street" ? streetStep() : step === "rules" ? rulesStep() : resultStep();
  }
  pbody.addEventListener("focusout", () => setTimeout(() => { if (pending && !pbody.contains(document.activeElement)) renderPanel(); }, 0));
  const nextBtn = (to: Step, t: string) => `<button class="btn primary next" data-go="${to}">${t} ←</button>`;
  function issuesHtml() {
    if (!P.parcel.closed) return `<p class="alert warn">${P.parcel.vertices.length < 3 ? "ارسم رؤوس الأرض بالضغط على الرسم، أو استورد ملف DXF، أو الصق الإحداثيات." : "الأرض غير مغلقة بعد. اضغط «إغلاق الأرض» أو اضغط على الرأس الأول."}</p>`;
    return info && info.issues.length ? info.issues.map(i => `<p class="alert err">${esc(i.msg)}</p>`).join("") : "";
  }

  function landStep() {
    const ok = info && info.valid, r = ringOf(P), ang = info && info.angles;
    return `
    <div class="sect"><h3>حدود الأرض</h3><p class="note">استورد ملف DXF من أوتوكاد (الأدق)، أو الصق إحداثيات الرؤوس، أو ارسم بالضغط على الرسم.</p>
      <div class="row"><button class="btn" data-a="import">${icon.upload}استيراد DXF</button><button class="btn" data-a="paste">${icon.paste}لصق إحداثيات</button></div></div>
    ${issuesHtml()}
    <div class="stats">
      <div class="stat"><b>${ok ? fmt(info!.area as number) : "—"}</b><span>مساحة الأرض م²</span></div>
      <div class="stat"><b>${ok ? fmt((info!.area as number) / 1000, 3) : "—"}</b><span>بالدونم</span></div>
      <div class="stat"><b>${ok ? fmt(info!.perimeter as number) : "—"}</b><span>المحيط م</span></div>
      <div class="stat"><b>${P.parcel.vertices.length}</b><span>عدد الرؤوس</span></div>
    </div>
    ${r.length ? `<div class="sect"><h3>الرؤوس والزوايا <span class="eyebrow">اكتب الإحداثي بالضبط أو اسحب الرأس</span></h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>X (م)</th><th>Y (م)</th><th>الزاوية</th><th></th></tr></thead><tbody>
    ${r.map((p, i) => `<tr class="${sel && sel.kind === "vertex" && sel.i === i ? "sel" : ""}" data-row-v="${i}"><td><span class="idx">${i + 1}</span></td>
      <td><input class="input num coord" inputmode="decimal" data-vx="${i}" value="${p[0]}"></td><td><input class="input num coord" inputmode="decimal" data-vy="${i}" value="${p[1]}"></td>
      <td class="num">${ang ? fmtDMS(ang[i]) : "—"}</td><td><button class="icon-btn" data-delv="${i}" aria-label="حذف الرأس ${i + 1}" ${P.parcel.closed && r.length <= 3 ? "disabled" : ""}>${icon.trash}</button></td></tr>`).join("")}
    </tbody></table></div>${ang ? `<p class="note">مجموع الزوايا الداخلية <span class="num">${fmt(ang.reduce((a, b) => a + b, 0), 6)}°</span> = <span class="num">${(r.length - 2) * 180}°</span> ✓</p>` : ""}</div>` : ""}
    <div class="sect"><h3>بيانات المشروع</h3><div class="defaults">
      <label class="field"><span>البلدة</span><input class="input" data-meta="town" value="${esc(P.meta.town)}"></label>
      <label class="field"><span>الحوض</span><input class="input" data-meta="block" value="${esc(P.meta.block)}"></label>
      <label class="field"><span>القطعة</span><input class="input" data-meta="parcel" value="${esc(P.meta.parcel)}"></label></div></div>
    ${P.parcel.vertices.length ? `<button class="btn danger" data-a="clear">${icon.trash}مسح الأرض والبدء من جديد</button>` : ""}
    ${ok ? nextBtn("street", "التالي: حدّد الشارع") : ""}`;
  }

  function streetStep() {
    const r = ringOf(P), n = r.length, sb = effectiveSetbacks(P), ns = countStreets(r, P.streets);
    return `
    <div class="sect"><h3>أين الشارع؟</h3>
      <p class="note"><b>اضغط على الضلع (أو الأضلاع) المطلّة على الشارع في الرسم.</b> إذا كانت أرضك على شارعين، اضغط الاثنين: كل ضلع على شارع يأخذ الارتداد الأمامي، والباقي جانبي ولا يوجد خلفي. مع شارع واحد، الضلع المقابل له يصبح خلفياً تلقائياً.</p>
      <p class="chip ${ns ? "ok" : "warn"}"><i></i>${ns ? `${ns === 1 ? "شارع واحد" : ns + " شوارع"} · ${P.streets.length} ${P.streets.length === 1 ? "ضلع" : "أضلاع"}` : "لم تحدد الشارع بعد"}</p></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>الضلع</th><th>الطول</th><th>النوع</th><th>الارتداد</th></tr></thead><tbody>
    ${r.map((p, i) => { const e = P.edges[i]; return `<tr class="${sel && sel.kind === "edge" && sel.i === i ? "sel" : ""}" data-row-e="${i}">
      <td><span class="idx">${i + 1}–${(i + 1) % n + 1}</span></td><td class="num">${fmt(dist(p as Pt, r[(i + 1) % n] as Pt))}</td>
      <td><select class="input" data-etype="${i}" aria-label="نوع الضلع ${i + 1}">${(["front", "side", "back"] as const).map(t => `<option value="${t}" ${e.type === t ? "selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}</select>${e.manualType ? `<span class="tag" title="عدّلته يدوياً">يدوي</span>` : ""}</td>
      <td><input class="input num" inputmode="decimal" data-ed="${i}" value="${e.d != null ? e.d : ""}" placeholder="${fmt(sb[i])}" aria-label="ارتداد خاص للضلع ${i + 1}"></td></tr>`; }).join("")}
    </tbody></table></div>
    <p class="note">خانة الارتداد فارغة = تأخذ قيمة نوعها من الاشتراطات. اكتب رقماً فقط إذا كان لهذا الضلع ارتداد مختلف.</p>
    ${P.edges.some(e => e.manualType) ? `<button class="btn ghost" data-a="autotypes">أرجع التصنيف التلقائي لكل الأضلاع</button>` : ""}
    ${P.streets.length ? nextBtn("rules", "التالي: الاشتراطات") : ""}`;
  }

  function rulesStep() {
    const R = P.rules, profiles = listProfiles();
    const num = (k: keyof Rules, label: string, unit: string, hint = "") => `<label class="field"><span>${label} <small>${unit}</small></span><input class="input num" inputmode="decimal" data-rule="${k}" value="${(R as any)[k] ?? ""}" placeholder="${hint}"></label>`;
    return `
    <div class="sect"><h3>اشتراطات البناء</h3><p class="note">لا يوجد نظام موحد لكل المناطق. أدخل اشتراطات بلديتك، أو اختر نظاماً حفظته سابقاً. القيم الحالية مبدئية فقط.</p>
      <div class="row"><select class="input" id="profSel" aria-label="نظام محفوظ"><option value="">— اختر نظاماً محفوظاً —</option>${profiles.map(p => `<option value="${p.id}">${esc(p.rules.profileName)}</option>`).join("")}</select>
      <button class="btn" data-a="saveprof">احفظ كنظام</button>${profiles.length ? `<button class="btn ghost" data-a="delprof">حذف المختار</button>` : ""}</div>
      <label class="field"><span>اسم النظام (بلدية / منطقة)</span><input class="input" data-rule="profileName" value="${esc(R.profileName)}"></label></div>
    <div class="sect"><h3>الارتدادات</h3><div class="rules-grid">
      ${num("front", '<i class="typedot" style="background:var(--front)"></i>أمامي (شارع)', "م")}
      ${num("side", '<i class="typedot" style="background:var(--side)"></i>جانبي', "م")}
      ${num("back", '<i class="typedot" style="background:var(--back)"></i>خلفي', "م")}
      ${num("secondFront", "الشارع الثاني", "م", "مثل الأمامي")}
    </div></div>
    <div class="sect"><h3>نسب وارتفاعات <span class="eyebrow">اختياري</span></h3><div class="rules-grid">
      ${num("coverage", "نسبة البناء", "%", "مثلاً 50")} ${num("maxFloors", "عدد الطوابق", "", "مثلاً 4")} ${num("maxHeight", "الارتفاع الأقصى", "م", "")}
    </div></div>
    <details class="adv"><summary>خيارات متقدمة: طريقة احتساب الزوايا الداخلية</summary>
      <p class="note">تؤثر فقط عند الزوايا الداخلة في الأرض (أكبر من 180°). عند الزوايا العادية يلتقي خطّا الارتداد بنفس الطريقة دائماً.</p>
      <div class="joins">${([["miter", "تقاطع الخطين (Miter)", "خطّا الارتداد يمتدان حتى يتقاطعا. الطريقة الافتراضية.", "M8 40 L8 8 L40 8"], ["square", "قطع مستقيم (Square)", "مثل التقاطع لكن يُقطع الرأس إذا ابتعد كثيراً.", "M8 40 L8 18 L18 8 L40 8"], ["round", "قوس (Round)", "أقل بعد عن الحد: قوس حول الرأس.", "M8 40 L8 22 A14 14 0 0 1 22 8 L40 8"]] as const).map(([k, t, d, pth]) => `
        <label class="join ${R.join === k ? "on" : ""}"><input type="radio" name="join" value="${k}" ${R.join === k ? "checked" : ""}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M2 46 L2 2 L46 2" fill="none" stroke="var(--parcel)" stroke-width="2"/><path d="${pth}" fill="none" stroke="var(--zone)" stroke-width="2.5" stroke-dasharray="4 3"/></svg><span><b>${t}</b><small>${d}</small></span></label>`).join("")}</div>
      <label class="field"><span>حد التقاطع (أضعاف الارتداد) <small>بعده يتحول إلى قطع مستقيم</small></span><input class="input num" inputmode="decimal" data-rule="miterLimit" value="${R.miterLimit}"></label>
    </details>
    <label class="field"><span>ملاحظات النظام</span><textarea class="input notes" data-rule="notes" rows="2">${esc(R.notes)}</textarea></label>
    ${nextBtn("result", "شاهد النتيجة")}`;
  }

  function resultStep() {
    const A = info && info.area || 0;
    const tone: Record<string, string> = { ok: "✓", info: "ℹ", warn: "!", err: "✕" };
    return `
    <div class="sect"><h3>النتيجة</h3></div>
    ${issuesHtml()}
    <div class="stats">
      <div class="stat"><b>${fmt(A)}</b><span>مساحة الأرض م²</span></div>
      <div class="stat zone"><b>${zone && zone.ok ? fmt(zone.area) : "—"}</b><span>داخل الارتدادات م²</span></div>
      <div class="stat wide hero"><b>${ex ? fmt(ex.allowed) : "—"}</b><span>أقصى مساحة لطابق البناء م² ${ex && ex.limitedBy === "coverage" ? "(حسب نسبة البناء)" : ex && ex.limitedBy === "setbacks" ? "(حسب الارتدادات)" : ""}</span></div>
    </div>
    ${ver ? `<p class="chip ${ver.ok ? "ok" : "err"} big"><i></i>${ver.ok ? "تم التحقق: لا تجاوز لأي ارتداد" : "تحذير: وُجدت مخالفة في التحقق"}</p>` : ""}
    <ul class="explain">${(ex ? ex.lines : []).map(l => `<li class="${l.tone}"><b aria-hidden="true">${tone[l.tone]}</b><span>${esc(l.text)}</span></li>`).join("")}</ul>
    <div class="row"><button class="btn primary" data-a="export">${icon.download}تصدير DXF بالإحداثيات الحقيقية</button></div>
    <p class="note">الملف يحوي: حدود الأرض (PARCEL)، المنطقة الصالحة للبناء (BUILDABLE_ZONE)، أطوال الأضلاع والارتدادات والمساحات (LABELS)، وأرقام الرؤوس.</p>
    <p class="note">هذه دراسة أولية تساعدك على الفهم والتخطيط. المخطط الرسمي للترخيص يعدّه مهندس مرخّص.</p>`;
  }

  function renderAll() {
    $$("[data-tool]", root).forEach((b: any) => { b.setAttribute("aria-pressed", String(b.dataset.tool === tool)); b.disabled = b.dataset.tool === "draw" && P.parcel.closed; });
    $("[data-a=undo]", root).disabled = !hist.canUndo; $("[data-a=redo]", root).disabled = !hist.canRedo;
    renderSteps(); renderDrawbar(); renderScene(); renderPanel();
  }
  function renderDrawbar() {
    const db = $("#drawbar", root), n = P.parcel.vertices.length;
    if (step === "street" && P.parcel.closed) { db.hidden = false; db.innerHTML = `<span>اضغط على ضلع الشارع في الرسم</span>`; return; }
    if (P.parcel.closed || tool !== "draw") { db.hidden = true; return; }
    db.hidden = false;
    db.innerHTML = `<span>${n ? `${n} ${n === 1 ? "رأس" : n === 2 ? "رأسان" : "رؤوس"} · اضغط لإضافة التالي` : "اضغط على الرسم لوضع أول رأس"}</span>
      ${n ? `<button class="btn" data-a="popv">تراجع عن آخر رأس</button>` : ""}${n >= 3 ? `<button class="btn primary" data-a="close">إغلاق الأرض</button>` : ""}<button class="btn" data-a="paste">${icon.paste}إحداثيات</button>`;
  }

  /* ---------- أحداث اللوحة ---------- */
  pbody.addEventListener("change", (e: any) => {
    const t = e.target, D = t.dataset;
    if (D.vx !== undefined || D.vy !== undefined) {
      const i = +(D.vx ?? D.vy), v = readNum(t.value), p = P.parcel.vertices[i];
      if (!Number.isFinite(v)) { toast("اكتب الإحداثي كرقم"); t.value = D.vx !== undefined ? p.x : p.y; return; }
      commit(ops.moveVertex(P, i, D.vx !== undefined ? v : p.x, D.vy !== undefined ? v : p.y));
    } else if (D.meta) commit(ops.setMeta(P, { [D.meta]: t.value.trim() }));
    else if (D.etype !== undefined) commit(ops.setEdgeType(P, +D.etype, t.value));
    else if (D.ed !== undefined) { const s = t.value.trim(); if (!s) return commit(ops.setEdgeD(P, +D.ed, null)); const v = readNum(s); if (!(v >= 0)) { toast("الارتداد رقم بالأمتار (0 أو أكثر)"); t.value = ""; return; } commit(ops.setEdgeD(P, +D.ed, v)); }
    else if (D.rule) {
      const k = D.rule as keyof Rules;
      if (k === "profileName" || k === "notes") return commit(ops.setRules(P, { [k]: t.value.trim() } as any));
      const s = t.value.trim(), v = readNum(s);
      const optional = k === "secondFront" || k === "coverage" || k === "maxFloors" || k === "maxHeight";
      if (!s && optional) return commit(ops.setRules(P, { [k]: null } as any));
      if (!(v >= 0) || (k === "miterLimit" && v < 1) || (k === "coverage" && v > 100)) { toast(k === "coverage" ? "النسبة بين 0 و 100" : k === "miterLimit" ? "حد التقاطع 1 أو أكثر" : "اكتب رقماً صحيحاً"); t.value = (P.rules as any)[k] ?? ""; return; }
      commit(ops.setRules(P, { [k]: v } as any));
    } else if (t.name === "join") commit(ops.setRules(P, { join: t.value }));
    else if (t.id === "profSel" && t.value) { const pr = listProfiles().find(p => p.id === t.value); if (pr) { commit(ops.setRules(P, { ...pr.rules })); toast(`طُبّق نظام «${pr.rules.profileName}»`); } }
  });
  pbody.addEventListener("keydown", (e: any) => { if (e.key === "Enter" && e.target.matches("input")) e.target.blur(); });
  pbody.addEventListener("click", (e: any) => {
    const d = e.target.closest("[data-delv]"); if (d) { delVertex(+d.dataset.delv); return; }
    const g = e.target.closest("[data-go]"); if (g) { goStep(g.dataset.go); return; }
    const re = e.target.closest("[data-row-e]"); if (re && !e.target.closest("input,select")) { sel = { kind: "edge", i: +re.dataset.rowE }; renderScene(); renderPanel(); }
    const rv = e.target.closest("[data-row-v]"); if (rv && !e.target.closest("input,button")) { sel = { kind: "vertex", i: +rv.dataset.rowV }; renderScene(); renderPanel(); }
  });
  function goStep(s: Step) { step = s; pending = false; if (document.activeElement && pbody.contains(document.activeElement)) (document.activeElement as any).blur(); if (s !== "land" && tool === "draw" && P.parcel.closed) tool = "select"; renderAll(); pbody.scrollTop = 0; if (panel.classList.contains("min")) setSheet(snaps()[1]); }
  $("#steps", root).addEventListener("click", (e: any) => { const b = e.target.closest("[data-step]"); if (b && !b.disabled) goStep(b.dataset.step); });

  /* ---------- الأوامر ---------- */
  function delVertex(i: number) { if (P.parcel.closed && P.parcel.vertices.length <= 3) return toast("الأرض تحتاج 3 رؤوس على الأقل"); commit(ops.deleteVertex(P, i)); sel = null; renderAll(); }
  function closeIt() {
    if (P.parcel.vertices.length < 3) return toast("ارسم 3 رؤوس على الأقل");
    commit(ops.closeParcel(P)); tool = "select";
    if (info && !info.valid) { toast("الأضلاع تتقاطع. اسحب الرؤوس لتصحيح الشكل"); renderAll(); return; }
    goStep("street");
  }
  function act(a: string) {
    if (a === "home") { ctx.store.flush(); ctx.go("projects"); }
    else if (a === "undo") undo(); else if (a === "redo") redo();
    else if (a === "zin" || a === "zout") { vp.zoomAt(vp.W / 2, vp.H / 2, a === "zin" ? 1.4 : 1 / 1.4); renderScene(); }
    else if (a === "fit") fitView();
    else if (a === "angles") { showAngles = !showAngles; $("[data-a=angles]", root).setAttribute("aria-pressed", String(showAngles)); renderScene(); }
    else if (a === "close") closeIt();
    else if (a === "popv") commit(ops.removeLastVertex(P));
    else if (a === "import") $("#dxfIn", root).click();
    else if (a === "export") doExport();
    else if (a === "paste") pasteDialog();
    else if (a === "clear") clearDialog();
    else if (a === "autotypes") commit(ops.resetAutoTypes(P));
    else if (a === "saveprof") { if (!P.rules.profileName || P.rules.profileName === "مخصّص") { toast("اكتب اسم النظام أولاً (مثلاً: بلدية عصيرة – منطقة سكن أ)"); return; } saveProfile(P.rules); toast(`حُفظ نظام «${P.rules.profileName}» لاستخدامه في مشاريع أخرى`); renderPanel(); }
    else if (a === "delprof") { const v = ($("#profSel", root) as any)?.value; if (!v) return toast("اختر النظام من القائمة أولاً"); deleteProfile(v); renderPanel(); toast("حُذف النظام المحفوظ"); }
  }
  root.addEventListener("click", (e: any) => { const b = e.target.closest("[data-a]"); if (b && root.contains(b)) act(b.dataset.a); const t = e.target.closest("[data-tool]"); if (t && !t.disabled) { tool = t.dataset.tool; renderAll(); } });
  $("#pname", root).addEventListener("change", (e: any) => { const v = e.target.value.trim() || "مشروع بدون اسم"; e.target.value = v; commit(ops.rename(P, v)); });

  async function pasteDialog() {
    const clip = await readClipboard(), pre = parseCoords(clip).length >= 3 ? clip : "";
    sheet(`<form><h2>إدخال الإحداثيات</h2>
      <p class="note">كل رأس في سطر: X ثم Y. يقبل ناتج أمر LIST من أوتوكاد، أو أعمدة من Excel (يتجاهل رقم النقطة والمنسوب). الأرقام تُحفظ كما كتبتها.</p>
      <textarea class="input" id="ptxt" placeholder="170000.000, 180000.000&#10;170030.000, 180002.000&#10;…" autofocus>${esc(pre)}</textarea>
      <div class="actions"><button class="btn primary" type="submit">اعتمد الإحداثيات</button><button class="btn ghost" type="button" data-act="cancel">إلغاء</button></div></form>`,
    (a, w) => {
      if (a !== "submit") return;
      const pts = parseCoords($("#ptxt", w).value);
      if (pts.length < 3) { toast("لم أجد ثلاثة رؤوس على الأقل"); return false; }
      commit(ops.setVertices(P, pts, true, "لصق")); sel = null; tool = "select"; fitView(); toast(`أُدخل ${pts.length} رأساً`); goStep("street");
    });
  }
  function clearDialog() {
    sheet(`<h2>مسح حدود الأرض؟</h2><p class="note">تُحذف كل الرؤوس وإعدادات الأضلاع من هذا المشروع. تقدر ترجعها بزر «تراجع».</p>
      <div class="actions"><button class="btn danger" data-act="ok">${icon.trash}امسح الأرض</button><button class="btn ghost" data-act="cancel">إلغاء</button></div>`,
    a => { if (a === "ok") { commit(ops.setVertices(P, [], false)); sel = null; tool = "draw"; goStep("land"); } });
  }
  $("#dxfIn", root).addEventListener("change", async (e: any) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    let res; try { res = parseDXF(new Uint8Array(await f.arrayBuffer())); } catch (er) { toast("تعذّرت قراءة الملف. احفظه من أوتوكاد بصيغة DXF."); return; }
    const cands = res.loops.map(l => ({ ...l, a: analyzeParcel(l.points) })).filter(l => l.a.valid);
    if (!cands.length) { toast(`لم أجد شكلاً مغلقاً في الملف${res.open ? ` (يوجد ${res.open} خطوط غير مغلقة)` : ""}. ارسم حدود الأرض كبوليلاين مغلق (Close).`, 6000); return; }
    const use = (c: any) => {
      commit(ops.setVertices(P, c.points, true, `${f.name} · ${c.layer}`)); sel = null; tool = "select"; fitView();
      const w = [...res.warnings]; if (res.units != null && res.units !== 6 && res.units !== 0) w.push(`وحدة الرسم في الملف «${UNIT_NAMES[res.units] || res.units}» وليست متر؛ الأرقام أُخذت كما هي.`);
      toast(`استوردت ${c.points.length} رأساً من الطبقة «${c.layer}» · ${fmt(c.a.area)} م²` + (w.length ? " · " + w.join(" ") : ""), 6000); goStep("street");
    };
    if (cands.length === 1) return use(cands[0]);
    sheet(`<form><h2>اختر حدود الأرض</h2><p class="note">في الملف ${cands.length} أشكال مغلقة على ${new Set(cands.map(c => c.layer)).size} طبقات. الأكبر محدد مسبقاً.</p>
      <div class="pick">${cands.slice(0, 15).map((c, k) => `<label><input type="radio" name="pc" value="${k}" ${k ? "" : "checked"}><span>الطبقة <b>${esc(c.layer)}</b> · ${c.points.length} رؤوس · <span class="num">${fmt(c.a.area as number)}</span> م²${c.hadArcs ? " · فيه أقواس" : ""}</span></label>`).join("")}</div>
      <div class="actions"><button class="btn primary" type="submit">استورد</button><button class="btn ghost" type="button" data-act="cancel">إلغاء</button></div></form>`,
    (a, w) => { if (a === "submit") use(cands[+w.querySelector("input[name=pc]:checked").value]); });
  });
  async function doExport() {
    if (!P.parcel.vertices.length) return toast("لا توجد حدود لتصديرها بعد");
    try { toast(await exportDXF(P, info, zone), 4000); }
    catch (e: any) { toast(e && e.code === "declined" ? "أُلغي الحفظ" : "تعذّر حفظ الملف" + (e && e.message ? ": " + e.message : "")); }
  }

  /* ---------- اللمس والفأرة ---------- */
  const ptrs = new Map<number, [number, number]>(); let drag: any = null, pinch: any = null;
  const local = (e: PointerEvent | WheelEvent): [number, number] => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function hitVertex(px: number, py: number) { let best = -1, bd = HIT + 1; ringOf(P).forEach((p, i) => { const s = vp.toScreen(p[0], p[1]), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = i; } }); return best; }
  function hitEdge(px: number, py: number) { if (!P.parcel.closed) return -1; const r = ringOf(P), n = r.length; let best = -1, bd = 14; for (let i = 0; i < n; i++) { const a = vp.toScreen(r[i][0], r[i][1]), b = vp.toScreen(r[(i + 1) % n][0], r[(i + 1) % n][1]), c = closestOnSeg([px, py], a, b).p, d = Math.hypot(c[0] - px, c[1] - py); if (d < bd) { bd = d; best = i; } } return best; }
  svg.addEventListener("pointerdown", (e: PointerEvent) => {
    svg.setPointerCapture(e.pointerId); const [px, py] = local(e); ptrs.set(e.pointerId, [px, py]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(b[0] - a[0], b[1] - a[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; drag = null; return; }
    const midEl = (e.target as any).closest && (e.target as any).closest("[data-mid]");
    if (tool === "select" && midEl && step === "land") {
      const i = +midEl.dataset.mid, r = ringOf(P), m: [number, number] = [(r[i][0] + r[(i + 1) % r.length][0]) / 2, (r[i][1] + r[(i + 1) % r.length][1]) / 2];
      commit(ops.insertVertex(P, i, m[0], m[1])); sel = { kind: "vertex", i: i + 1 }; drag = { kind: "vertex", i: i + 1, start: [px, py], moved: false, recorded: true }; renderAll(); return;
    }
    const v = tool !== "pan" && step === "land" ? hitVertex(px, py) : -1;
    if (tool === "select" && v >= 0) { drag = { kind: "vertex", i: v, start: [px, py], moved: false, recorded: false }; sel = { kind: "vertex", i: v }; renderScene(); return; }
    if (tool === "draw" && v === 0 && P.parcel.vertices.length >= 3) { drag = { kind: "close", start: [px, py], moved: false }; return; }
    drag = { kind: "pan", start: [px, py], last: [px, py], moved: false };
  });
  svg.addEventListener("pointermove", (e: PointerEvent) => {
    const [px, py] = local(e); cursor = vp.toWorld(px, py); $("#coords", root).textContent = `X ${fmtCoord(cursor[0])} · Y ${fmtCoord(cursor[1])}`;
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(b[0] - a[0], b[1] - a[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; vp.panBy(m[0] - pinch.m[0], m[1] - pinch.m[1]); vp.zoomAt(m[0], m[1], d / (pinch.d || d)); pinch = { d, m }; renderScene(); return; }
    if (!drag) { if (tool === "draw" && !P.parcel.closed) renderScene(); return; }
    if (!drag.moved && Math.hypot(px - drag.start[0], py - drag.start[1]) > 5) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === "pan") { vp.panBy(px - drag.last[0], py - drag.last[1]); drag.last = [px, py]; renderScene(); }
    else if (drag.kind === "vertex") { if (!drag.recorded) { hist.push(P); drag.recorded = true; } P = ops.moveVertex(P, drag.i, cursor[0], cursor[1]); compute(); renderScene(); }
  });
  function endPtr(e: PointerEvent) {
    const [px, py] = local(e); ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    const d = drag; drag = null; if (!d) return;
    if (d.kind === "vertex") { if (d.moved) ctx.store.save(P); renderAll(); return; }
    if (d.kind === "close") { if (!d.moved) closeIt(); return; }
    if (d.kind === "pan" && !d.moved) {
      if (tool === "draw" && !P.parcel.closed) { const w = vp.toWorld(px, py); commit(ops.addVertex(P, w[0], w[1])); return; }
      const ei = hitEdge(px, py);
      if (step === "street" && ei >= 0) { commit(ops.toggleStreet(P, ei)); sel = { kind: "edge", i: ei }; renderAll(); return; }
      if (tool === "select") { sel = ei >= 0 ? { kind: "edge", i: ei } : null; renderScene(); renderPanel(); }
    }
  }
  svg.addEventListener("pointerup", endPtr); svg.addEventListener("pointercancel", endPtr);
  svg.addEventListener("pointerleave", () => { if (!drag) { cursor = null; if (tool === "draw") renderScene(); } });
  svg.addEventListener("wheel", (e: WheelEvent) => { e.preventDefault(); const [px, py] = local(e); vp.zoomAt(px, py, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); renderScene(); }, { passive: false });
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as any).matches && (e.target as any).matches("input,textarea,select")) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if ((k === "delete" || k === "backspace") && sel && sel.kind === "vertex") { e.preventDefault(); delVertex(sel.i); }
    else if (k === "enter" && tool === "draw") closeIt();
    else if (k === "escape") { sel = null; renderAll(); }
  };
  document.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => { resize(); renderScene(); }); ro.observe(cw);

  compute(); resize(); renderAll(); requestAnimationFrame(fitView);
  return () => { document.removeEventListener("keydown", onKey); ro.disconnect(); offStore(); ctx.store.flush(); };
}
