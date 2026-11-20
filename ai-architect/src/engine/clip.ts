/**
 * غلاف العمليات المنطقية على المضلعات (Clipper2) بأعداد صحيحة.
 * الإحداثيات تُزاح لنقطة مرجعية ثم تُضرب في SCALE (0.1 ملم) وتُقرَّب لأعداد صحيحة،
 * فلا توجد أخطاء فاصلة عائمة في التقاطعات والحواف المتطابقة.
 * أي محرك آخر يمكن أن يحل محله بنفس الواجهة.
 */
import { Clipper, Clipper64, ClipType, FillRule, Path64, Paths64, Point64, JoinType, EndType } from "clipper2-js";
import pc from "polygon-clipping";
import type { Pt, Ring } from "./geometry";

export const SCALE = 1e4;        // 1 وحدة صحيحة = 0.1 ملم
export const UNIT = 1 / SCALE;   // بالمتر

export interface Polygon { outer: Ring; holes: Ring[] }

export class IntFrame {
  constructor(public ox: number, public oy: number) {}
  toInt(r: Ring): Path64 { const p = new Path64(); for (const q of r) p.push(new Point64(Math.round((q[0] - this.ox) * SCALE), Math.round((q[1] - this.oy) * SCALE))); return p; }
  toWorld(p: Path64): Ring { return p.map(q => [q.x / SCALE + this.ox, q.y / SCALE + this.oy] as Pt); }
  paths(rings: Ring[]): Paths64 { const ps = new Paths64(); rings.forEach(r => { if (r.length >= 3) ps.push(this.toInt(r)); }); return ps; }
  /** كل الحلقات بنفس الاتجاه (موجب): ضروري حتى لا تلغي المضلعات المتداخلة بعضها بقاعدة NonZero */
  positive(rings: Ring[]): Paths64 { const ps = this.paths(rings); for (let i = 0; i < ps.length; i++) if (Clipper.area(ps[i]) < 0) ps[i] = Clipper.reversePath(ps[i]); return ps; }
}

/** ناتج Clipper: الحلقات الموجبة خارجية والسالبة ثقوب؛ كل ثقب يُنسب لأصغر حلقة خارجية تحتويه.
 *  (PolyTree في نسخة clipper2-js الحالية لا يعمل، فنعيد بناء الشجرة بأنفسنا) */
function toPolys(sol: Paths64, f: IntFrame): Polygon[] {
  const a2 = (p: Path64) => { let s = 0; for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; s += u.x * v.y - v.x * u.y; } return s / 2; };
  const inside = (pt: { x: number; y: number }, p: Path64) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const A = p[i], B = p[j]; if ((A.y > pt.y) !== (B.y > pt.y) && pt.x < (B.x - A.x) * (pt.y - A.y) / (B.y - A.y) + A.x) c = !c; } return c; };
  const outers = sol.filter(p => a2(p) > 0).map(p => ({ p, a: a2(p), holes: [] as Path64[] }));
  for (const h of sol.filter(p => a2(p) < 0)) {
    // نقطة داخل الثقب قريبة من حده: منتصف أول ضلع مزاح قليلاً
    const c = outers.filter(o => h.every(q => inside(q, o.p) || o.p.some(r => r.x === q.x && r.y === q.y))).sort((x, y) => x.a - y.a)[0];
    if (c) c.holes.push(h);
  }
  return outers.map(o => ({ outer: f.toWorld(o.p), holes: o.holes.map(h => f.toWorld(h)) }));
}
function run(f: IntFrame, type: ClipType, a: Ring[], b: Ring[]): Polygon[] {
  const c = new Clipper64(); c.addSubjectPaths(f.paths(a)); if (b.length) c.addClipPaths(f.paths(b));
  const sol = new Paths64(); c.execute(b.length ? type : ClipType.Union, FillRule.NonZero, sol);
  return toPolys(sol, f);
}
/** محرك العمليات المنطقية المستخدم: polygon-clipping (أرقام عشرية مضاعفة الدقة، خوارزمية Martinez) */
export let BACKEND: "pc" | "clipper" = "pc";
export function setBackend(b: "pc" | "clipper") { BACKEND = b; }
function differencePC(f: IntFrame, subject: Ring[], clips: Ring[]): Polygon[] {
  const loc = (r: Ring) => { const q = r.map(p => [p[0] - f.ox, p[1] - f.oy] as [number, number]); q.push(q[0]); return q; };
  const subj: any = subject.map(r => [loc(r)]);
  const cl: any[] = clips.filter(r => r.length >= 3).map(r => [[loc(r)]]);
  const res: any = cl.length ? (pc as any).difference(subj, ...cl) : subj;
  return res.map((poly: any) => ({ outer: poly[0].slice(0, -1).map((p: number[]) => [p[0] + f.ox, p[1] + f.oy] as Pt), holes: poly.slice(1).map((h: number[][]) => h.slice(0, -1).map(p => [p[0] + f.ox, p[1] + f.oy] as Pt)) }));
}

/** (subject − clips) ثم تقليص الناتج للداخل بعدد وحدات صحيحة (هامش أمان ضد تقريب الإحداثيات) */
export function differenceShrunk(f: IntFrame, subject: Ring[], clips: Ring[], shrinkUnits: number, backend: "pc" | "clipper" = BACKEND): Polygon[] {
  if (backend === "pc") return differencePC(f, subject, clips);
  // كل قطع يُطبَّع وحده أولاً (اتحاد بقاعدة NonZero): مضلع ملتفّ على نفسه قد يحوي مناطق باتجاه سالب
  // تلغي غيرها عند الجمع، فنحوّله إلى مضلعات سليمة موجبة قبل الطرح.
  const norm = new Paths64();
  for (const r of clips) {
    if (r.length < 3) continue;
    // نتجاهل القطوع المتلاشية بعد التحويل لأعداد صحيحة (أقل من 3 نقاط مختلفة أو مساحة أقل من 0.5 ملم²):
    // Clipper2-js قد يخطئ في النتيجة كلها عند وجود مضلعات متلاشية كهذه
    const ip = Clipper.stripDuplicates(f.toInt(r), true);
    if (ip.length < 3 || Math.abs(Clipper.area(ip)) < 5000) continue;
    const one = new Paths64(); one.push(ip);
    for (const p of Clipper.Union(one, undefined, FillRule.NonZero)) norm.push(Clipper.area(p) < 0 ? Clipper.reversePath(p) : p);
  }
  // نوحّد القطوع أولاً ثم نطرح الاتحاد من الأرض (أثبت عددياً من طرح عشرات المضلعات المتداخلة دفعة واحدة)
  const clipUnion = norm.length ? Clipper.Union(norm, undefined, FillRule.NonZero) : norm;
  const c = new Clipper64(); c.addSubjectPaths(f.positive(subject)); if (clipUnion.length) c.addClipPaths(clipUnion);
  const sol = new Paths64(); c.execute(clipUnion.length ? ClipType.Difference : ClipType.Union, FillRule.NonZero, sol);
  const shrunk = shrinkUnits > 0 && sol.length ? Clipper.InflatePaths(sol, -shrinkUnits, JoinType.Miter, EndType.Polygon, 2) : sol;
  return toPolys(shrunk, f);
}
/** subject − clips مع الحفاظ على الثقوب */
export const difference = (f: IntFrame, subject: Ring[], clips: Ring[]) => run(f, ClipType.Difference, subject, clips);
export const intersection = (f: IntFrame, a: Ring[], b: Ring[]) => run(f, ClipType.Intersection, a, b);
/** مساحة (A − B) بالأعداد الصحيحة: صفر تماماً يعني أن A داخل B */
export function outsideArea(f: IntFrame, a: Ring[], b: Ring[]): number {
  const c = new Clipper64(); c.addSubjectPaths(f.paths(a)); c.addClipPaths(f.paths(b));
  const sol = new Paths64(); c.execute(ClipType.Difference, FillRule.NonZero, sol);
  let s = 0; for (const p of sol) { let a2 = 0; for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a2 += u.x * v.y - v.x * u.y; } s += Math.abs(a2) / 2; }
  return s / (SCALE * SCALE);
}
