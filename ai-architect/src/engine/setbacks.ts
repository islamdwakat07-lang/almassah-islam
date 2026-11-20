/**
 * محرك الارتدادات v2 – الإزاحة الموازية للداخل (Parallel Offset).
 *
 *   المنطقة الصالحة للبناء = الأرض − ⋃ شريط كل ضلع − ⋃ المناطق الممنوعة عند الرؤوس
 *
 * • شريط الضلع i: الرباعي بين الضلع وخطه الموازي على بعد d[i] نحو الداخل.
 * • الرؤوس (corners.ts): المحدّبة تعطي تقاطع الخطين الموازيين تماماً، والمقعّرة حسب نوع الوصلة
 *   (miter الافتراضي مع حد، أو square، أو round).
 * • الأمان: كل قطع يُبنى بارتداد مزاد 0.2 ملم، والقرص بمضلع محيط بالدائرة، والطرح بأعداد صحيحة
 *   (Clipper2 بدقة 0.1 ملم). كل الحلقات تُوحَّد اتجاهاتها قبل الطرح.
 */
import { Pt, Ring, cleanRing, signedArea, area as ringArea, analyzeParcel, ParcelInfo, frameOf } from "./geometry";
export { frameOf } from "./geometry";
import { IntFrame, Polygon, differenceShrunk } from "./clip";
import { verifyPoints, samplesOf } from "./verify";
import { cornerGeoms, JoinType } from "./corners";

export type { JoinType } from "./corners";
export interface SetbackOptions { join?: JoinType; miterLimit?: number; arcSegments?: number; verifyStep?: number }
export interface CornerInfo { vertex: number; angle: number; reflex: boolean; join: string; dMax: number }
export interface ZoneResult {
  ok: boolean; msg: string; parts: Polygon[]; area: number; ratio: number; parcelArea: number;
  setbacks: number[]; join: JoinType; miterLimit: number; corners: CornerInfo[]; info: ParcelInfo;
  /** نتيجة المُحقِّق المستقل داخل المحرك: true = لا توجد أي نقطة أقرب للحدود من الارتداد */
  verified?: boolean; engine?: string;
}
/** هامش الأمان: أكبر من خطأ تقريب الإحداثيات للأعداد الصحيحة (0.07 ملم) */
export const MARGIN = 2e-4;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];

export function buildableZone(pts: ReadonlyArray<ReadonlyArray<number>>, setbacks: ReadonlyArray<number>, opt: SetbackOptions = {}): ZoneResult {
  const join: JoinType = opt.join || "miter", miterLimit = opt.miterLimit && opt.miterLimit >= 1 ? opt.miterLimit : 3, N = opt.arcSegments || 72;
  const info = analyzeParcel(pts);
  const empty = (msg: string): ZoneResult => ({ ok: false, msg, parts: [], area: 0, ratio: 0, parcelArea: info.area || 0, setbacks: [], join, miterLimit, corners: [], info });
  if (!info.valid || !info.ring) return empty((info.issues[0] || { msg: "الأرض غير صالحة" }).msg);
  const r = info.ring, F = frameOf(r), n = F.n;
  if (setbacks.length && setbacks.length !== n) return empty(`عدد الارتدادات (${setbacks.length}) لا يساوي عدد الأضلاع (${n}).`);
  const d = Array.from({ length: n }, (_, i) => { const v = Number(setbacks[i]); return Number.isFinite(v) && v > 0 ? v : 0; });
  const dd = d.map(v => v + MARGIN);   // كل الأضلاع (حتى بارتداد صفر) تأخذ هامش 0.2 ملم ضد أخطاء التقريب
  const cuts: Ring[] = [];
  for (let i = 0; i < n; i++) {
    if (!dd[i]) continue;
    // في الإزاحة الموازية الشريط نحو الداخل فقط (ويمتد نصف ملم للخارج)؛ وفي round (أقل بعد) من الجهتين،
    // لأن نقطة عبر شق ضيق في الأرض قد تكون قريبة من ضلع على الجهة الأخرى
    const a = F.L[i], b = F.L[(i + 1) % n], o = mul(F.nin[i], dd[i]), e = join === "round" ? mul(F.nin[i], -dd[i]) : mul(F.nin[i], -0.0005);
    cuts.push([add(a, e), add(b, e), add(b, o), add(a, o)]);
  }
  const geoms = cornerGeoms(F.L, F.u, F.nin, F.len, dd, F.ccw, join, miterLimit, 0.001);
  const corners: CornerInfo[] = geoms.map(g => ({ vertex: g.vertex, angle: (info.angles as number[])[g.vertex], reflex: g.kind === "reflex", join: g.used, dMax: d[(g.vertex - 1 + n) % n] > d[g.vertex] ? d[(g.vertex - 1 + n) % n] : d[g.vertex] }));
  for (const g of geoms) {
    cuts.push(...g.polys);
    if (g.disc) { const R = g.disc.r / Math.cos(Math.PI / N), c = g.disc.c, disc: Ring = []; for (let k = 0; k < N; k++) { const t = 2 * Math.PI * (k + 0.5) / N; disc.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]); } cuts.push(disc); }
  }
  const f = new IntFrame(F.O[0], F.O[1]), world = cuts.map(c => c.map(p => add(p, F.O)));
  // نحسب بمحرك العمليات الأساسي، ونتحقق فوراً بالمُحقِّق المستقل؛ إن فشل أو ظهرت مخالفة نجرّب المحرك الآخر.
  let parts: Polygon[] = [], verified = false, engineUsed = "", lastErr = "";
  for (const backend of ["pc", "clipper"] as const) {
    try {
      const raw = differenceShrunk(f, [r], world, 0, backend);
      const cand = raw.map(p => ({ outer: despike(p.outer), holes: p.holes.map(h => despike(h, true)).filter(h => h.length >= 3) }))
        // نحذف الأجزاء الشظوية (عرضها أقل من 2 ملم أو مساحتها أقل من 10 سم²): حذفها يصغّر المنطقة فقط
        .filter(p => { if (p.outer.length < 3) return false; const A = partArea(p), per = p.outer.reduce((s, q, k) => s + Math.hypot(p.outer[(k + 1) % p.outer.length][0] - q[0], p.outer[(k + 1) % p.outer.length][1] - q[1]), 0); return A > 1e-3 && A / per > 1e-3; })
        .sort((a, b) => partArea(b) - partArea(a));
      const v = verifyPoints(r, d, join, miterLimit, samplesOf(cand.flatMap(p => [p.outer, ...p.holes]), opt.verifyStep || 0.05));
      parts = cand; engineUsed = backend; verified = v.ok;
      if (v.ok) break;
      lastErr = `مخالفة ${v.violations.length}`;
    } catch (e: any) { lastErr = String(e && e.message || e); }
  }
  if (!engineUsed) return empty("تعذّر حساب المنطقة: " + lastErr);
  const total = parts.reduce((s, p) => s + partArea(p), 0), parcelArea = info.area as number;
  return {
    ok: true, parts, area: total, ratio: total / parcelArea, parcelArea, setbacks: d, join, miterLimit, corners, info, verified, engine: engineUsed,
    msg: !parts.length ? "لا تبقى أي مساحة للبناء بعد هذه الارتدادات." : parts.length > 1 ? `المنطقة الصالحة مقسومة إلى ${parts.length} أجزاء منفصلة.` : ""
  };
}
/**
 * إزالة «الأشواك» عديمة المساحة تقريباً (عرضها أقل من نصف ملم) الناتجة عن تلامس القطوع، والرؤوس الواقعة على خط مستقيم.
 * لا يُحذف إلا رأس يؤدي حذفه إلى تصغير المنطقة (أو تكبير الثقب)، فلا يمكن أن يُدخل الحذف أي جزء ممنوع.
 */
export function despike(ring: Ring, isHole = false, tol = 5e-4): Ring {
  let r = cleanRing(ring, 1e-6), changed = true;
  const sgn = Math.sign(signedArea(r)) || 1;
  while (changed && r.length >= 3) {
    changed = false;
    for (let i = 0; i < r.length && r.length >= 3; i++) {
      const p = r[(i - 1 + r.length) % r.length], c = r[i], q = r[(i + 1) % r.length];
      const qx = q[0] - p[0], qy = q[1] - p[1], Lpq = Math.hypot(qx, qy);
      const tri = ((c[0] - p[0]) * (q[1] - p[1]) - (c[1] - p[1]) * (q[0] - p[0])) / 2;   // موجب: c يسار pq
      const off = Lpq < 1e-9 ? Math.hypot(c[0] - p[0], c[1] - p[1]) : Math.abs(2 * tri) / Lpq;
      const back = (c[0] - p[0]) * (q[0] - c[0]) + (c[1] - p[1]) * (q[1] - c[1]) < 0;
      // حذف c يغيّر المساحة الموقعة للحلقة بمقدار -(-tri)... : الرأس c «يبرز» للخارج إذا كان على يمين pq لحلقة موجبة
      const shrinks = tri * sgn > 0;                        // حذف رأس محدّب يصغّر الحلقة
      const safe = isHole ? !shrinks : shrinks;
      // الحذف غير «الآمن» مسموح فقط إذا كان التغيير أقل من 20 ميكرون (أصغر بكثير من هامش الأمان 0.2 ملم)
      if ((off < 1e-7) || (back && (safe ? off < tol : off < 2e-5)) || (back && Lpq < 1e-9)) { r.splice(i, 1); changed = true; break; }
    }
  }
  return r.length >= 3 ? r : [];
}
export const partArea = (p: Polygon) => ringArea(p.outer) - p.holes.reduce((s, h) => s + ringArea(h), 0);
