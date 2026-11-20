/**
 * المُحقِّق المستقل: يفحص نقاطاً كثيفة على حدود أي شكل (المنطقة أو مبنى لاحقاً)
 * ويرفض النتيجة إن وُجدت نقطة تخالف قاعدة الارتداد حسب نوع الوصلة.
 * لا يستخدم Clipper، بل حسابات مسافات مباشرة بالأرقام العشرية.
 */
import { Pt, Ring, cleanRing, segDist, pointInRing } from "./geometry";
import { frameOf } from "./geometry";
import { cornerGeoms, insidePoly } from "./corners";
import type { JoinType, ZoneResult } from "./setbacks";
import type { Polygon } from "./clip";
import { IntFrame, outsideArea } from "./clip";

export interface Violation { p: Pt; rule: string; edge?: number; vertex?: number; need: number; got: number }
export interface VerifyResult { ok: boolean; checked: number; worst: number; violations: Violation[] }

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

export function samplesOf(rings: Ring[], step = 0.05): Pt[] {
  const out: Pt[] = [];
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

export function verifyPoints(parcel: ReadonlyArray<ReadonlyArray<number>>, setbacks: ReadonlyArray<number>, join: JoinType, miterLimit: number, pts: Pt[], tol = 1e-6): VerifyResult {
  const r = cleanRing(parcel), F = frameOf(r), n = F.n, O = F.O, L = F.L, u = F.u, nin = F.nin, len = F.len;
  const d = r.map((_, i) => Math.max(0, Number(setbacks[i]) || 0));
  // المناطق الممنوعة عند الرؤوس بالارتداد الدقيق (بدون هامش)
  const forbidden: Array<{ v: number; test: (p: Pt) => number }> = [];
  for (const g of cornerGeoms(L, u, nin, len, d, F.ccw, join, miterLimit, 0)) {
    for (const poly of g.polys) forbidden.push({ v: g.vertex, test: p => (insidePoly(p, poly, tol) ? 1 : -1) });
    if (g.disc) { const c = g.disc.c, R = g.disc.r; forbidden.push({ v: g.vertex, test: p => R - Math.hypot(p[0] - c[0], p[1] - c[1]) }); }
  }

  const vio: Violation[] = []; let worst = Infinity;
  for (const pw of pts) {
    const p = sub(pw, O);
    // داخل الأرض: سماحية 0.1 ملم (دقة تقريب الإحداثيات) على الأضلاع بارتداد صفر فقط؛ غيرها يحميه هامش الأمان
    if (pointInRing(p, L as Ring, 1e-4) < 0) { vio.push({ p: pw, rule: "outside", need: 0, got: -1 }); worst = Math.min(worst, -1); continue; }
    for (let i = 0; i < n; i++) {
      if (!d[i]) continue;
      const a = L[i], t = ((p[0] - a[0]) * u[i][0] + (p[1] - a[1]) * u[i][1]);
      if (t <= 5e-4 || t >= len[i] - 5e-4) continue;   // نقاط على العمود عند طرفي الضلع (±0.5 ملم) تحكمها قواعد الرؤوس
      const perp = (p[0] - a[0]) * nin[i][0] + (p[1] - a[1]) * nin[i][1];
      if (perp < -tol) continue;   // النقطة خلف خط الضلع (عبر شق أو نتوء): يحكمها الضلع القريب منها
      const slack = perp - d[i];
      if (slack < worst) worst = slack;
      if (slack < -tol) vio.push({ p: pw, rule: "band", edge: i, need: d[i], got: perp });
    }
    if (join === "round") for (let i = 0; i < n; i++) { if (!d[i]) continue; const g = segDist(p, L[i], L[(i + 1) % n]); if (g - d[i] < -tol) vio.push({ p: pw, rule: "distance", edge: i, need: d[i], got: g }); }
    for (const f of forbidden) { const v = f.test(p); if (v > tol) vio.push({ p: pw, rule: "corner", vertex: f.v, need: 0, got: v }); }
  }
  return { ok: vio.length === 0, checked: pts.length, worst, violations: vio.slice(0, 20) };
}

export function verifyZone(parcel: ReadonlyArray<ReadonlyArray<number>>, zone: ZoneResult, step = 0.05): VerifyResult {
  const rings = zone.parts.flatMap(p => [p.outer, ...p.holes]);
  return verifyPoints(parcel, zone.setbacks, zone.join, zone.miterLimit, samplesOf(rings, step));
}

/** فحص أن شكل مبنى (أو أي مضلع) لا يتجاوز الارتدادات: بالأعداد الصحيحة ثم بالمُحقِّق المستقل */
export function checkFootprint(parcel: ReadonlyArray<ReadonlyArray<number>>, zone: ZoneResult, footprint: Polygon | Ring) {
  const rings = Array.isArray((footprint as Polygon).outer) ? [(footprint as Polygon).outer] : [footprint as Ring];
  const o = rings[0][0], f = new IntFrame(o[0], o[1]);
  const zoneRings = zone.parts.flatMap(p => [p.outer, ...p.holes]);   // الثقوب باتجاه معاكس فتُطرح بقاعدة NonZero
  // المرجع الحاسم هو المُحقِّق بالمسافات الدقيقة (سماحية 1 ميكرون). مساحة الخروج عن المنطقة للمعلومات فقط،
  // لأن المنطقة نفسها مقلّصة 0.1 ملم كهامش أمان فقد يلامسها مبنى على خط الارتداد تماماً.
  const out = zone.parts.length ? outsideArea(f, rings, zoneRings) : Infinity;
  const v = verifyPoints(parcel, zone.setbacks, zone.join, zone.miterLimit, samplesOf(rings, 0.05).concat(rings.flat()));
  return { ok: v.ok && Number.isFinite(out), outsideArea: out, verify: v };
}
