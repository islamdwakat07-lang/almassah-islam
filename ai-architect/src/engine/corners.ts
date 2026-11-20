/**
 * المناطق الممنوعة عند رؤوس الأرض (مشتركة بين المحرك والمُحقِّق).
 * المحرك يبنيها بارتداد مزاد قليلاً ويمدّها pad داخل الشريطين المجاورين (تداخل بدل حدود مشتركة)،
 * والمُحقِّق يبنيها بالارتداد الدقيق ويتأكد أنه لا توجد نقطة من المنطقة/المبنى داخلها.
 *
 * كل منطقة = تقاطع أنصاف مستويات (مضلع محدّب)، فالبناء مستقر عددياً حتى في الحالات الملتوية.
 * عند الرأس V بين الضلع الداخل a والخارج b (q = p − V):
 *  • محدّبة: امتداد شريط a بعد V حتى خط الضلع b:  ua·q ≥ 0 ، 0 ≤ na·q ≤ da ، nb·q ≥ 0 ، ub·q ≤ طول b
 *            وامتداد شريط b قبل V حتى خط الضلع a:  ub·q ≤ 0 ، 0 ≤ nb·q ≤ db ، na·q ≥ 0 ، ua·q ≥ −طول a
 *            النتيجة: حد المنطقة هو تقاطع الخطين الموازيين تماماً (Miter) مهما اختلف الارتدادان.
 *  • مقعّرة: الإسفين بين العمودين على الضلعين عند V وأقرب من الارتدادين لخطّي الضلعين:
 *            ua·q ≥ 0 ، ub·q ≤ 0 ، na·q ≤ da ، nb·q ≤ db       ← miter (حتى تقاطع الخطين الموازيين)
 *            + w·q ≤ max(da, db)                                ← square (أو miter تجاوز الحد)
 *            قرص نصف قطره max(da, db)                           ← round
 *  • مستقيمة تماماً، أو محدّبة شبه مستقيمة (انحراف < 5°) بارتدادين مختلفين: درجة عند V (بدون امتداد)، وفي round قرص.
 *    (المقعّرة شبه المستقيمة تُعامل كأي زاوية مقعّرة: الإسفين الضيق بين العمودين يُقطع.)
 */
import type { Pt, Ring } from "./geometry";

export type JoinType = "miter" | "square" | "round";
export type CornerKind = "convex" | "reflex" | "straight";
export interface CornerGeom { vertex: number; kind: CornerKind; used: JoinType | "convex" | "step"; dMax: number; polys: Ring[]; disc?: { c: Pt; r: number } }

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const neg = (a: Pt): Pt => [-a[0], -a[1]];
const norm = (a: Pt): Pt => { const L = Math.hypot(a[0], a[1]) || 1; return [a[0] / L, a[1] / L]; };

/** يقص مضلعاً محدّباً بنصف المستوى n·p ≤ c */
export function clipHalf(poly: Ring, n: Pt, c: number): Ring {
  const out: Ring = [];
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length], fp = n[0] * p[0] + n[1] * p[1] - c, fq = n[0] * q[0] + n[1] * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp <= 0) !== (fq <= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
/** مضلع = مربع كبير حول V مقصوص بأنصاف المستويات n·(p−V) ≤ c */
function halfPlanes(V: Pt, R: number, hs: Array<[Pt, number]>): Ring {
  let poly: Ring = [[V[0] - R, V[1] - R], [V[0] + R, V[1] - R], [V[0] + R, V[1] + R], [V[0] - R, V[1] + R]];
  for (const [n, c] of hs) { poly = clipHalf(poly, n, dot(n, V) + c); if (poly.length < 3) return []; }
  return poly;
}
const areaOf = (r: Ring) => { let s = 0; for (let i = 0; i < r.length; i++) s += cross(r[i], r[(i + 1) % r.length]); return Math.abs(s) / 2; };

const STRAIGHT = Math.sin(5 * Math.PI / 180);

/**
 * @param L رؤوس الأرض (محلية) · u اتجاه كل ضلع · nin العمودي للداخل · len الأطوال · d الارتدادات
 * @param pad تداخل القطوع مع الشرائط (للمحرك فقط)
 */
export function cornerGeoms(L: Pt[], u: Pt[], nin: Pt[], len: number[], d: number[], ccw: boolean, join: JoinType, miterLimit: number, pad = 0): CornerGeom[] {
  const n = L.length, out: CornerGeom[] = [];
  for (let i = 0; i < n; i++) {
    const ia = (i - 1 + n) % n, ib = i, V = L[i], ua = u[ia], ub = u[ib], na = nin[ia], nb = nin[ib], da = d[ia], db = d[ib];
    const s = cross(ua, ub) * (ccw ? 1 : -1), dMax = Math.max(da, db);
    const straightish = Math.abs(s) < STRAIGHT && dot(ua, ub) > 0;
    const kind: CornerKind = Math.abs(s) < 1e-12 && dot(ua, ub) > 0 ? "straight" : s > 0 ? "convex" : "reflex";
    const g: CornerGeom = { vertex: i, kind, used: kind === "convex" ? "convex" : join, dMax, polys: [] };
    out.push(g);
    if (!dMax) continue;
    const R = Math.min(1000, 4 * dMax / Math.max(Math.abs(s), 0.02) + 4 * dMax + 1);
    const push = (p: Ring) => { if (p.length >= 3 && areaOf(p) > 1e-10) g.polys.push(p); };

    // round = تعريف «أقل بعد عن الحد»: الشرائط + قرص عند كل رأس نصف قطره أكبر الارتدادين (بدون امتدادات)
    if (join === "round") { g.disc = { c: V, r: dMax }; g.used = kind === "convex" ? "convex" : "round"; continue; }
    if (kind === "convex") {
      // شبه مستقيمة بارتدادين مختلفين: درجة عند V بدل امتداد طويل لخط الارتداد الأكبر
      if (straightish && da !== db) { g.used = "step"; continue; }
      if (da) push(halfPlanes(V, R, [[neg(ua), pad], [na, da], [neg(na), pad], [neg(nb), pad], [ub, len[ib] + pad]]));
      if (db) push(halfPlanes(V, R, [[ub, pad], [nb, db], [neg(nb), pad], [neg(na), pad], [neg(ua), len[ia] + pad]]));
      continue;
    }
    if (kind === "straight") { g.used = "step"; continue; }
    // مقعّرة
    const hs: Array<[Pt, number]> = [[neg(ua), pad], [ub, pad], [na, da], [nb, db]];
    const kite = halfPlanes(V, R, hs);
    const far = kite.reduce((m, p) => Math.max(m, Math.hypot(p[0] - V[0], p[1] - V[1])), 0) - pad * 2;
    if (join === "miter" && far <= miterLimit * dMax + 1e-9) { push(kite); g.used = "miter"; continue; }
    g.used = "square";
    push(halfPlanes(V, R, [...hs, [norm(add(na, nb)), dMax]]));
  }
  return out;
}

/** هل النقطة داخل مضلع بعمق أكبر من tol (النقاط على الحد مسموحة)؟ */
export function insidePoly(p: Pt, poly: Ring, tol: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  if (!c) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-24) continue;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
    if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= tol) return false;
  }
  return true;
}
