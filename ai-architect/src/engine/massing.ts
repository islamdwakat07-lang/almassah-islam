/**
 * المرحلة 2 – أشكال المبنى (كتلة الطابق الأرضي) داخل المنطقة الصالحة للبناء.
 *
 * كل الحسابات هندسية بحتة:
 *  • نعمل في إطار محلي لكل ضلع شارع: s على طول الضلع، t عمودياً للداخل (t = البعد عن خط الشارع).
 *  • أعرض مستطيل داخل شريط [t0, t0+h] يُحسب بدقة: الشريط − المنطقة = الأجزاء الممنوعة،
 *    وأي جزء ممنوع داخل الشريط يمنع كل المستطيلات التي يتقاطع مداها s مع مسقطه (لأن المستطيل يغطي الشريط كله عمودياً).
 *  • «يتبع خطوط الارتداد»: المنطقة ∩ الشريط، والعمق يُحسب بالتنصيف حتى تساوي المساحة المطلوبة.
 *  • كل شكل يُفحص أخيراً بالمُحقِّق المستقل (checkFootprint)، وأي شكل فيه تجاوز لا يُعرض أبداً.
 */
import pc from "polygon-clipping";
import { cleanRing, frameOf, Pt, Ring, signedArea, selfIntersections } from "./geometry";
import type { ZoneResult } from "./setbacks";
import { checkFootprint } from "./verify";

export type MassKind = "full" | "fill" | "center" | "right" | "left" | "custom";
export interface MassOption {
  id: string; kind: MassKind; front: number;
  title: string; desc: string;
  ring: Pt[];            // بالإحداثيات الحقيقية
  area: number; width: number; depth: number;
  frontGap: number;      // المسافة بين واجهة المبنى وخط الشارع (م)
  rect: boolean; verified: boolean;
}
export interface MassResult {
  ok: boolean; msg: string; target: number; used: number;
  capped: "coverage" | "zone" | null; maxRect: number; options: MassOption[];
}

const EPS_T = 1e-5;     // نبدأ الشريط 0.01 ملم بعد أقرب نقطة في المنطقة (تفادياً لشرائح تقريب بسماكة صفر)
const SHRINK = 1e-5;    // نقلّص المستطيل 0.01 ملم من كل جهة قبل الفحص
const AREA_TOL = 1e-3;  // دقة المساحة المطلوبة: 0.001 م²

interface Frame { a: Pt; u: Pt; n: Pt }
const toL = (F: Frame, p: ReadonlyArray<number>): Pt => { const x = p[0] - F.a[0], y = p[1] - F.a[1]; return [x * F.u[0] + y * F.u[1], x * F.n[0] + y * F.n[1]]; };
const toW = (F: Frame, q: Pt): Pt => [F.a[0] + q[0] * F.u[0] + q[1] * F.n[0], F.a[1] + q[0] * F.u[1] + q[1] * F.n[1]];
const close = (r: Pt[]) => { const q = r.map(p => [p[0], p[1]] as [number, number]); q.push(q[0]); return q; };
const ringArea = (r: ReadonlyArray<ReadonlyArray<number>>) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const pcArea = (poly: number[][][]) => ringArea(poly[0].slice(0, -1)) - poly.slice(1).reduce((s, h) => s + ringArea(h.slice(0, -1)), 0);

/** محرك الشريط لضلع شارع واحد */
class Strip {
  zone: any; sMin: number; sMax: number; tMin: number; tMax: number;
  constructor(public F: Frame, zoneParts: ZoneResult["parts"]) {
    this.zone = zoneParts.map(p => [close(p.outer.map(q => toL(F, q))), ...p.holes.map(h => close(h.map(q => toL(F, q))))]);
    const all = this.zone.flat(2) as number[][];
    this.sMin = Math.min(...all.map(p => p[0])) - 1; this.sMax = Math.max(...all.map(p => p[0])) + 1;
    this.tMin = Math.min(...all.map(p => p[1])); this.tMax = Math.max(...all.map(p => p[1]));
  }
  /** المجالات الحرة على s لمستطيل يغطي الشريط [t0, t0+h] كاملاً */
  free(t0: number, h: number): Array<[number, number]> {
    const box = [[[this.sMin, t0], [this.sMax, t0], [this.sMax, t0 + h], [this.sMin, t0 + h], [this.sMin, t0]]];
    const bad: number[][][][] = (pc as any).difference(box, this.zone);
    const blocks: Array<[number, number]> = [];
    for (const poly of bad) { if (pcArea(poly) < 1e-8) continue; const xs = poly[0].map(p => p[0]); blocks.push([Math.min(...xs), Math.max(...xs)]); }
    blocks.sort((a, b) => a[0] - b[0]);
    const out: Array<[number, number]> = []; let cur = this.sMin;
    for (const [a, b] of blocks) { if (a > cur + 1e-9) out.push([cur, a]); cur = Math.max(cur, b); }
    if (this.sMax > cur + 1e-9) out.push([cur, this.sMax]);
    // المجالات الملاصقة لطرفي الصندوق الاصطناعي ليست داخل المنطقة
    return out.filter(([a, b]) => a > this.sMin + 1e-9 && b < this.sMax - 1e-9);
  }
  widest(t0: number, h: number): [number, number] | null {
    let best: [number, number] | null = null;
    for (const iv of this.free(t0, h)) if (!best || iv[1] - iv[0] > best[1] - best[0]) best = iv;
    return best;
  }
  /** الشكل «يتبع خطوط الارتداد»: المنطقة ∩ الشريط، أكبر قطعة فقط */
  fill(t0: number, h: number): number[][] | null {
    const box = [[[this.sMin, t0], [this.sMax, t0], [this.sMax, t0 + h], [this.sMin, t0 + h], [this.sMin, t0]]];
    const res: number[][][][] = (pc as any).intersection(box, this.zone);
    let best: number[][][] | null = null, ba = 0;
    for (const poly of res) { const a = pcArea(poly); if (a > ba) { ba = a; best = poly; } }
    return best ? best[0].slice(0, -1) : null;   // المنطقة لا ثقوب فيها عادةً داخل شريط أمامي
  }
  fillArea(t0: number, h: number) { const r = this.fill(t0, h); return r ? ringArea(r) : 0; }
}

/**
 * اتجاه الشارع: أضلاع الشارع المتتالية (مثل قوس مقسّم لعشرات الأضلاع القصيرة) تُجمع في واجهة واحدة
 * اتجاهها هو الوتر من أول رأس لآخر رأس، بدل أن يُؤخذ اتجاه ضلع قصير واحد من القوس.
 */
export interface StreetFace { F: Frame; edges: number[]; len: number; label: string }
export function streetFaces(parcel: Ring, fronts: number[]): StreetFace[] {
  const n = parcel.length, Fr = frameOf(parcel), set = new Set(fronts.filter(i => i >= 0 && i < n));
  if (!set.size) set.add(0);
  const dir = (i: number) => Math.atan2(Fr.u[i][1], Fr.u[i][0]);
  const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
  // نبدأ من ضلع شارع ليس قبله ضلع شارع (أو أي ضلع إن كانت كل الأضلاع شوارع)
  let start = [...set].find(i => !set.has((i - 1 + n) % n)); if (start === undefined) start = [...set][0];
  const groups: number[][] = []; let cur: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (!set.has(i)) { if (cur.length) groups.push(cur); cur = []; continue; }
    if (cur.length && angDiff(dir(i), dir(cur[0])) > 30 * Math.PI / 180) { groups.push(cur); cur = []; }
    cur.push(i);
  }
  if (cur.length) groups.push(cur);
  const faces = groups.map(g => {
    const a = parcel[g[0]], b = parcel[(g[g.length - 1] + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; let nn: Pt = [-u[1], u[0]];
    const ni = Fr.nin[g[0]]; if (nn[0] * ni[0] + nn[1] * ni[1] < 0) nn = [u[1], -u[0]];
    return { F: { a: [a[0], a[1]] as Pt, u, n: nn }, edges: g, len: L, label: `${g[0] + 1}–${(g[g.length - 1] + 1) % n + 1}` };
  }).filter(f => f.len > 1e-6).sort((p, q) => q.len - p.len);
  const out = faces.slice(0, 1);
  for (const f of faces.slice(1)) if (out.length < 2 && angDiff(Math.atan2(f.F.u[1], f.F.u[0]), Math.atan2(out[0].F.u[1], out[0].F.u[0])) > 20 * Math.PI / 180) out.push(f);
  return out;
}

/** هل الشكل «منطقي» كمبنى؟ بلا زوايا حادة (أقل من 60°) ولا رؤوس كثيرة ولا تعرجات */
function niceShape(r: number[][]): boolean {
  const n = r.length; if (n < 3 || n > 8) return false;
  let sa = 0; for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; sa += a[0] * b[1] - b[0] * a[1]; }
  const sg = sa > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = r[(i - 1 + n) % n], c = r[i], q = r[(i + 1) % n];
    const a1 = Math.atan2(p[1] - c[1], p[0] - c[0]), a2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
    let ang = (sg > 0 ? a1 - a2 : a2 - a1) * 180 / Math.PI; ang = ((ang % 360) + 360) % 360;
    if (ang < 60) return false;
  }
  return true;
}

/** أصغر عمق h يحقق g(h) ≥ A بفحص تصاعدي ثم تنصيف. g = أكبر مساحة متاحة بعمق h */
function solveDepth(g: (h: number) => number, A: number, hMax: number): { h: number; best: number } | null {
  let prev = 0, best = 0; const step = Math.max(0.1, hMax / 120);
  for (let h = step; h <= hMax + 1e-9; h += step) {
    const v = g(Math.min(h, hMax)); best = Math.max(best, v);
    if (v >= A) {
      let lo = prev, hi = Math.min(h, hMax);
      for (let k = 0; k < 50 && hi - lo > 1e-7; k++) { const m = (lo + hi) / 2; if (g(m) >= A) hi = m; else lo = m; }
      return { h: hi, best };
    }
    prev = h;
  }
  return { h: NaN, best };
}

export interface MassingInput {
  parcel: ReadonlyArray<ReadonlyArray<number>>;
  zone: ZoneResult;
  fronts: number[];            // أضلاع الشوارع
  setbacks: number[];          // الارتداد الفعلي لكل ضلع
  target: number;              // مساحة البناء المطلوبة للطابق
  coverageMax?: number | null; // أقصى مساحة حسب نسبة البناء
  exclusions?: Pt[][];         // مناطق رسمها المستخدم يمنع فيها البناء
}

/** المنطقة الصالحة بعد طرح المناطق الممنوعة التي رسمها المستخدم */
export function effectiveParts(zone: ZoneResult, exclusions: Pt[][] = []): ZoneResult["parts"] {
  const ex = exclusions.filter(r => r && r.length >= 3);
  if (!ex.length) return zone.parts;
  const o = zone.parts[0]?.outer[0] || [0, 0], L = (r: Pt[]) => close(r.map(p => [p[0] - o[0], p[1] - o[1]] as Pt));
  const subj = zone.parts.map(p => [L(p.outer), ...p.holes.map(L)]);
  const res: number[][][][] = (pc as any).difference(subj, ...ex.map(r => [[L(r)]]));
  const W = (r: number[][]) => r.slice(0, -1).map(p => [p[0] + o[0], p[1] + o[1]] as Pt);
  return res.filter(poly => pcArea(poly) > 1e-4).map(poly => ({ outer: W(poly[0]), holes: poly.slice(1).map(W) }));
}

/** فحص مبنى (مقترح أو رسمه المستخدم): داخل الارتدادات، لا يقطع نفسه، ولا يدخل في المناطق الممنوعة */
export function checkBuilding(parcel: ReadonlyArray<ReadonlyArray<number>>, zone: ZoneResult, ring: Pt[], exclusions: Pt[][] = []): { ok: boolean; reason: string } {
  if (ring.length >= 4 && selfIntersections(ring).length) return { ok: false, reason: "أضلاع المبنى تتقاطع مع بعضها" };
  if (ring.length < 3 || ringArea(ring) < 1e-4) return { ok: false, reason: "الشكل صغير جداً" };
  const c = checkFootprint(parcel, zone, ring);
  if (!c.ok) { const v = c.verify.violations[0]; return { ok: false, reason: v && v.rule === "outside" ? "جزء من المبنى خارج حدود الأرض" : v && v.edge !== undefined ? `المبنى يتجاوز ارتداد الضلع ${v.edge + 1}–${(v.edge + 1) % parcel.length + 1}` : "المبنى يتجاوز الارتداد عند زاوية" }; }
  const o = ring[0], L = (r: Pt[]) => close(r.map(p => [p[0] - o[0], p[1] - o[1]] as Pt));
  for (const ex of exclusions) {
    if (!ex || ex.length < 3) continue;
    const it: number[][][][] = (pc as any).intersection([L(ring)], [L(ex)]);
    if (it.some(poly => pcArea(poly) > 1e-6)) return { ok: false, reason: "المبنى يدخل في منطقة ممنوعة رسمتها" };
  }
  return { ok: true, reason: "" };
}

export function generateMassing(inp: MassingInput): MassResult {
  const res: MassResult = { ok: false, msg: "", target: inp.target, used: inp.target, capped: null, maxRect: 0, options: [] };
  const z = inp.zone;
  if (!z || !z.ok || !z.parts.length) { res.msg = "لا توجد منطقة صالحة للبناء بعد."; return res; }
  if (!(inp.target > 0)) { res.msg = "اكتب مساحة البناء المطلوبة."; return res; }
  const parcel = cleanRing(inp.parcel); if (signedArea(parcel) === 0) { res.msg = "حدود الأرض غير صالحة."; return res; }
  const parts = effectiveParts(z, inp.exclusions);
  if (!parts.length) { res.msg = "المناطق الممنوعة التي رسمتها تغطي كل المنطقة الصالحة للبناء."; return res; }
  const zoneMax = Math.max(...parts.map(p => ringArea(p.outer) - p.holes.reduce((s, h) => s + ringArea(h), 0)));
  let A = inp.target;
  if (inp.coverageMax != null && A > inp.coverageMax + AREA_TOL) { A = inp.coverageMax; res.capped = "coverage"; }
  if (A > zoneMax) { A = zoneMax; res.capped = res.capped || "zone"; }
  res.used = A;
  const faces = streetFaces(parcel, inp.fronts);
  const opts: MassOption[] = [];

  for (const face of faces) {
    const F = face.F, fe = face.edges[0], S = new Strip(F, parts), tA = S.tMin + EPS_T;
    if (!(S.tMax - tA > 0)) continue;
    // بداية المبنى من جهة الشارع: عادةً أقرب نقطة في المنطقة. لكن إذا كان خط الارتداد الأمامي منحنياً أو مائلاً
    // (شارع مقوّس) نجرب نقاط بدء عند انكسارات المنطقة ونختار ما يجعل المبنى أقرب ما يكون للشارع (أصغر t0 + العمق)
    const gFullAt = (t: number) => (h: number) => { const w = S.widest(t, h); return w ? (w[1] - w[0]) * h : 0; };
    const Aeff = A + 4 * SHRINK * Math.sqrt(A);
    let t0 = tA, sol = solveDepth(gFullAt(tA), Aeff, S.tMax - tA), bestEnd = sol && Number.isFinite(sol.h) ? tA + sol.h : Infinity;
    const cands = [...new Set(parts.flatMap(p => p.outer).map(q => toL(F, q)[1]).filter(t => t > tA + 0.02 && t < tA + Math.min(4, S.tMax - tA)).map(t => +t.toFixed(4)))].sort((a, b) => a - b);
    const step = Math.max(1, Math.ceil(cands.length / 10));
    for (let k = 0; k < cands.length; k += step) {
      const t = cands[k] + EPS_T; if (t >= bestEnd) break;
      const s2 = solveDepth(gFullAt(t), Aeff, S.tMax - t);
      if (s2 && Number.isFinite(s2.h) && t + s2.h < bestEnd - 0.01) { t0 = t; sol = s2; bestEnd = t + s2.h; }
      else if (s2 && sol) sol.best = Math.max(sol.best, s2.best);
    }
    const hMax = S.tMax - t0;
    const tag = faces.length > 1 ? ` · على الشارع ${face.label}` : "";
    const gap = t0;   // بعد الواجهة عن خط الشارع
    const mkRect = (kind: MassKind, s0: number, s1: number, h: number, title: string, desc: string) => {
      const q: Pt[] = [[s0 + SHRINK, t0 + SHRINK], [s1 - SHRINK, t0 + SHRINK], [s1 - SHRINK, t0 + h - SHRINK], [s0 + SHRINK, t0 + h - SHRINK]];
      opts.push({ id: `${kind}-${fe}`, kind, front: fe, title: title + tag, desc, ring: q.map(p => toW(F, p)), area: (s1 - s0 - 2 * SHRINK) * (h - 2 * SHRINK), width: s1 - s0 - 2 * SHRINK, depth: h - 2 * SHRINK, frontGap: gap, rect: true, verified: false });
    };

    // 1) يملأ العرض بين الارتدادات الجانبية، ملاصق للارتداد الأمامي
    res.maxRect = Math.max(res.maxRect, sol ? sol.best : 0);
    if (sol && Number.isFinite(sol.h)) {
      const iv = S.widest(t0, sol.h)!; let h = (A + 1e-6) / (iv[1] - iv[0] - 2 * SHRINK) + 2 * SHRINK; if (h > sol.h) h = sol.h;
      const iv2 = S.widest(t0, h) || iv;
      mkRect("full", iv2[0], iv2[1], h, "يملأ العرض حتى الارتدادات الجانبية", "ملاصق لخط الارتداد الأمامي ويستغل العرض كاملاً.");
    }

    // 2) يتبع خطوط الارتداد (للأراضي المائلة): المنطقة ∩ الشريط
    if (S.fillArea(tA, S.tMax - tA) >= A - AREA_TOL) {
      let lo = 0, hi = S.tMax - tA;
      for (let k = 0; k < 60 && hi - lo > 1e-7; k++) { const m = (lo + hi) / 2; if (S.fillArea(tA, m) >= A) hi = m; else lo = m; }
      const r = S.fill(tA, hi);
      const xs0 = r ? r.map(p => p[0]) : [];
      if (r && niceShape(r) && r.length <= 6 && (Math.max(...xs0) - Math.min(...xs0)) <= 3 * hi) {   // لا شرائط طويلة رفيعة
        const ring = r.map(p => toW(F, p as Pt)), xs = r.map(p => p[0]);
        opts.push({ id: `fill-${fe}`, kind: "fill", front: fe, title: "يتبع خطوط الارتداد" + tag, desc: "شكل يلتصق بخطوط الارتداد المائلة ويستغل كل سنتيمتر.", ring, area: ringArea(r), width: Math.max(...xs) - Math.min(...xs), depth: hi, frontGap: tA, rect: false, verified: false });
      }
    }

    // 3) مستطيل متناسق (قريب من المربع): في الوسط / ملاصق لليمين / لليسار (كما تراه من الشارع)
    let w = Math.sqrt(A * 0.8), h = A / w;
    if (h > hMax - 2 * SHRINK) { h = hMax - 2 * SHRINK; w = A / h; }
    const ivc = S.free(t0, h + 2 * SHRINK).filter(([a, b]) => b - a >= w + 2 * SHRINK).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    if (ivc && ivc[1] - ivc[0] > w + 0.3) {
      const hh = h + 2 * SHRINK, ww = w + 2 * SHRINK, mid = (ivc[0] + ivc[1]) / 2;
      mkRect("center", mid - ww / 2, mid + ww / 2, hh, "مستطيل متناسق في الوسط", "مسافة متساوية عن الجارين، وحديقة على الجانبين.");
      mkRect("right", ivc[1] - ww, ivc[1], hh, "مستطيل ملاصق لليمين", "ملاصق للارتداد الأيمن (وأنت واقف في الشارع تنظر للأرض)، ويترك ساحة كبيرة يساراً.");
      mkRect("left", ivc[0], ivc[0] + ww, hh, "مستطيل ملاصق لليسار", "ملاصق للارتداد الأيسر (وأنت واقف في الشارع تنظر للأرض)، ويترك ساحة كبيرة يميناً.");
    }
  }

  // الفحص المستقل: لا يُعرض أي شكل فيه تجاوز، ونحذف المكرر
  const seen: MassOption[] = [];
  for (const o of opts) {
    o.verified = checkBuilding(inp.parcel, z, o.ring, inp.exclusions).ok;
    if (!o.verified) continue;
    if (seen.some(s => s.rect === o.rect && Math.abs(s.area - o.area) < 0.05 && s.ring.length === o.ring.length && s.ring.every((p, k) => Math.hypot(p[0] - o.ring[k][0], p[1] - o.ring[k][1]) < 0.05))) continue;   // نفس الشكل بنفس المكان
    if (o.kind === "fill" && seen.some(s => s.front === o.front && s.kind === "full" && Math.abs(s.area - o.area) < 0.01 && Math.abs(s.depth - o.depth) < 0.01)) continue;
    seen.push(o);
  }
  res.options = seen; res.ok = seen.length > 0;
  res.msg = res.ok ? "" : res.maxRect > 0
    ? `لا يتسع مبنى بمساحة ${A.toFixed(2)} م² داخل الارتدادات بالشكل المطلوب. أكبر مستطيل ملاصق للشارع يتسع ≈ ${res.maxRect.toFixed(2)} م².`
    : "تعذّر وضع مبنى داخل المنطقة الصالحة.";
  return res;
}
