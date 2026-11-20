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
import { cleanRing, frameOf, Pt, Ring, signedArea } from "./geometry";
import type { ZoneResult } from "./setbacks";
import { checkFootprint } from "./verify";

export type MassKind = "full" | "fill" | "center" | "right" | "left";
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

function frameFor(parcel: Ring, edge: number): Frame {
  const F = frameOf(parcel), i = edge, a = parcel[i];
  return { a: [a[0], a[1]], u: F.u[i] as Pt, n: F.nin[i] as Pt };
}

/** أصغر عمق h يحقق g(h) ≥ A بفحص تصاعدي ثم تنصيف. g = أكبر مساحة متاحة بعمق h */
function solveDepth(g: (h: number) => number, A: number, hMax: number): { h: number; best: number } | null {
  let prev = 0, best = 0; const step = Math.max(0.05, hMax / 400);
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
}

export function generateMassing(inp: MassingInput): MassResult {
  const res: MassResult = { ok: false, msg: "", target: inp.target, used: inp.target, capped: null, maxRect: 0, options: [] };
  const z = inp.zone;
  if (!z || !z.ok || !z.parts.length) { res.msg = "لا توجد منطقة صالحة للبناء بعد."; return res; }
  if (!(inp.target > 0)) { res.msg = "اكتب مساحة البناء المطلوبة."; return res; }
  const parcel = cleanRing(inp.parcel); if (signedArea(parcel) === 0) { res.msg = "حدود الأرض غير صالحة."; return res; }
  const zoneMax = Math.max(...z.parts.map(p => ringArea(p.outer) - p.holes.reduce((s, h) => s + ringArea(h), 0)));
  let A = inp.target;
  if (inp.coverageMax != null && A > inp.coverageMax + AREA_TOL) { A = inp.coverageMax; res.capped = "coverage"; }
  if (A > zoneMax) { A = zoneMax; res.capped = res.capped || "zone"; }
  res.used = A;
  const fronts = inp.fronts.length ? inp.fronts : [0];
  const opts: MassOption[] = [];

  for (const fe of fronts.slice(0, 2)) {
    const F = frameFor(parcel, fe), S = new Strip(F, z.parts), t0 = S.tMin + EPS_T, hMax = S.tMax - t0;
    if (!(hMax > 0)) continue;
    const tag = fronts.length > 1 ? ` · على الشارع ${fe + 1}–${(fe + 1) % parcel.length + 1}` : "";
    const gap = t0;   // بعد الواجهة عن خط الشارع
    const mkRect = (kind: MassKind, s0: number, s1: number, h: number, title: string, desc: string) => {
      const q: Pt[] = [[s0 + SHRINK, t0 + SHRINK], [s1 - SHRINK, t0 + SHRINK], [s1 - SHRINK, t0 + h - SHRINK], [s0 + SHRINK, t0 + h - SHRINK]];
      opts.push({ id: `${kind}-${fe}`, kind, front: fe, title: title + tag, desc, ring: q.map(p => toW(F, p)), area: (s1 - s0 - 2 * SHRINK) * (h - 2 * SHRINK), width: s1 - s0 - 2 * SHRINK, depth: h - 2 * SHRINK, frontGap: gap, rect: true, verified: false });
    };

    // 1) يملأ العرض بين الارتدادات الجانبية، ملاصق للارتداد الأمامي
    const gFull = (h: number) => { const w = S.widest(t0, h); return w ? (w[1] - w[0]) * h : 0; };
    const sol = solveDepth(gFull, A + 4 * SHRINK * Math.sqrt(A), hMax);
    res.maxRect = Math.max(res.maxRect, sol ? sol.best : 0);
    if (sol && Number.isFinite(sol.h)) {
      const iv = S.widest(t0, sol.h)!; let h = (A + 1e-6) / (iv[1] - iv[0] - 2 * SHRINK) + 2 * SHRINK; if (h > sol.h) h = sol.h;
      const iv2 = S.widest(t0, h) || iv;
      mkRect("full", iv2[0], iv2[1], h, "يملأ العرض حتى الارتدادات الجانبية", "ملاصق لخط الارتداد الأمامي ويستغل العرض كاملاً.");
    }

    // 2) يتبع خطوط الارتداد (للأراضي المائلة): المنطقة ∩ الشريط
    if (S.fillArea(t0, hMax) >= A - AREA_TOL) {
      let lo = 0, hi = hMax;
      for (let k = 0; k < 60 && hi - lo > 1e-7; k++) { const m = (lo + hi) / 2; if (S.fillArea(t0, m) >= A) hi = m; else lo = m; }
      const r = S.fill(t0, hi);
      if (r) {
        const ring = r.map(p => toW(F, p as Pt)), xs = r.map(p => p[0]);
        opts.push({ id: `fill-${fe}`, kind: "fill", front: fe, title: "يتبع خطوط الارتداد" + tag, desc: "شكل يلتصق بخطوط الارتداد المائلة ويستغل كل سنتيمتر.", ring, area: ringArea(r), width: Math.max(...xs) - Math.min(...xs), depth: hi, frontGap: gap, rect: false, verified: false });
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
    const c = checkFootprint(inp.parcel, z, o.ring); o.verified = c.ok;
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
