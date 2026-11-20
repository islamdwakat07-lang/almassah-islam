import { describe, it, expect } from "vitest";
import * as G from "../src/engine/geometry";
import { buildableZone, partArea, JoinType } from "../src/engine/setbacks";
import { verifyZone, checkFootprint, verifyPoints, samplesOf } from "../src/engine/verify";
import { classifyEdges, countStreets } from "../src/engine/classify";
import { IntFrame, outsideArea } from "../src/engine/clip";
import { explain } from "../src/engine/explain";

type P = [number, number];
const OX = 170123.456, OY = 181234.567;
const shift = (r: P[], dx = OX, dy = OY): P[] => r.map(([x, y]) => [x + dx, y + dy]);
const regular = (n: number, R: number, c: P = [OX, OY], rot = 0.3): P[] => Array.from({ length: n }, (_, k) => [c[0] + R * Math.cos(rot + 2 * Math.PI * k / n), c[1] + R * Math.sin(rot + 2 * Math.PI * k / n)] as P);
const JOINS: JoinType[] = ["miter", "square", "round"];
/** المنطقة أصغر من القيمة الدقيقة بهامش الأمان فقط (0.2 ملم × المحيط تقريباً)، ولا تزيد عنها أبداً */
function nearSafe(got: number, exact: number, tol = 0.05) { expect(got).toBeLessThanOrEqual(exact + 1e-6); expect(exact - got).toBeLessThan(tol); }

/** الحل التحليلي للأرض المحدّبة: تقاطع أنصاف المستويات (كل خط موازٍ للضلع على بعد ارتداده) */
function convexExact(r: P[], d: number[]): number {
  const ccw = G.signedArea(r) > 0;
  let poly: P[] = r.map(p => [p[0] - r[0][0], p[1] - r[0][1]] as P);
  const L = poly.slice();
  for (let i = 0; i < L.length; i++) {
    const a = L[i], b = L[(i + 1) % L.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: P = ccw ? [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] : [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    const c = a[0] * n[0] + a[1] * n[1] + d[i];   // نصف المستوى: n·p ≥ c
    const out: P[] = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length], fp = p[0] * n[0] + p[1] * n[1] - c, fq = q[0] * n[0] + q[1] * n[1] - c;
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    poly = out; if (poly.length < 3) return 0;
  }
  return G.area(poly);
}

describe("الهندسة الأساسية", () => {
  it("مربع ومضلعات منتظمة بإحداثيات حقيقية: المساحة والأطوال والزوايا", () => {
    const sq = shift([[0, 0], [20, 0], [20, 20], [0, 20]]), a = G.analyzeParcel(sq);
    expect(a.area).toBeCloseTo(400, 9); expect(a.perimeter).toBeCloseTo(80, 9); a.angles!.forEach(t => expect(t).toBeCloseTo(90, 9));
    for (const n of [3, 5, 6, 8, 12, 50]) {
      const R = 17.3, q = G.analyzeParcel(regular(n, R));
      expect(q.area).toBeCloseTo(n * R * R * Math.sin(2 * Math.PI / n) / 2, 7);
      q.edges!.forEach(L => expect(L).toBeCloseTo(2 * R * Math.sin(Math.PI / n), 8));
      q.angles!.forEach(t => expect(t).toBeCloseTo(180 * (n - 2) / n, 7));
    }
  });
  it("أرض L مقعّرة وأرض غير منتظمة", () => {
    const l = G.analyzeParcel(shift([[0, 0], [30, 0], [30, 10], [12, 10], [12, 25], [0, 25]]));
    expect(l.area).toBeCloseTo(480, 9); expect(l.angles![3]).toBeCloseTo(270, 9);
    const irr: P[] = [[175000.123, 180000.456], [175031.789, 180002.001], [175033.5, 180026.25], [175004.75, 180031.875], [174998, 180014.5]];
    const tri = (a: P, b: P, c: P) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    expect(G.area(irr)).toBeCloseTo(tri(irr[0], irr[1], irr[2]) + tri(irr[0], irr[2], irr[3]) + tri(irr[0], irr[3], irr[4]), 7);
    expect(G.interiorAngles(irr).reduce((s, v) => s + v, 0)).toBeCloseTo(540, 9);
  });
  it("كشف الأضلاع المتقاطعة والرؤوس على خط واحد", () => {
    expect(G.analyzeParcel([[0, 0], [10, 10], [10, 0], [0, 10]]).issues[0].code).toBe("cross");
    expect(G.analyzeParcel([[0, 0], [1, 1], [2, 2]]).valid).toBe(false);
  });
});

describe("محرك الارتدادات – الإزاحة الموازية", () => {
  it("مستطيل بارتدادات مختلفة لكل ضلع: نفس النتيجة الدقيقة بكل أنواع الوصلة", () => {
    const R = shift([[0, 0], [30, 0], [30, 20], [0, 20]]);
    for (const join of JOINS) {
      const z = buildableZone(R, [5, 3, 4, 2], { join });
      nearSafe(z.area, 25 * 11);
      expect(z.parts[0].outer.length).toBe(4);
      expect(verifyZone(R, z).ok).toBe(true);
    }
  });
  it("أراضٍ محدّبة غير منتظمة (مثلث حاد، خماسي، سداسي): تطابق الحل التحليلي", () => {
    const cases: Array<[P[], number[]]> = [
      [shift([[0, 0], [40, 0], [10, 30]]), [3, 4, 5]],
      [shift([[0, 0], [60, 0], [8, 9]]), [2, 1.5, 2]],                         // زاوية حادة جداً عند الرأس 2
      [shift([[0, 0], [31.7, 2], [33.5, 26.25], [4.75, 31.9], [-2, 14.5]]), [5, 3.5, 3, 2.25, 0]],
      [shift([[0, 0], [25, -3], [41, 8], [38, 27], [15, 33], [-4, 18]]), [6, 3, 3, 4, 3, 2.5]],
      [regular(7, 20), [3, 3, 3, 3, 3, 3, 3]]
    ];
    for (const [r, d] of cases) for (const join of JOINS) {
      const z = buildableZone(r, d, { join });
      // miter و square = تقاطع الخطوط الموازية تماماً؛ round (أقل بعد) يطابقه فقط إذا تساوت الارتدادات عند كل زاوية
      if (join !== "round" || d.every(x => x === d[0])) nearSafe(z.area, convexExact(r, d));
      else expect(z.area).toBeGreaterThanOrEqual(convexExact(r, d) - 0.05);
      expect(verifyZone(r, z).ok).toBe(true);
    }
  });
  it("زاوية مقعّرة 270° (أرض L): miter = 163، square = 163.686، round = 163.858", () => {
    const L = shift([[0, 0], [30, 0], [30, 10], [12, 10], [12, 25], [0, 25]]), d = [5, 3, 2, 2, 4, 3];
    const m = buildableZone(L, d, { join: "miter" }), s = buildableZone(L, d, { join: "square" }), r = buildableZone(L, d, { join: "round" });
    nearSafe(m.area, 163); nearSafe(s.area, 163 + (4 - 2 * Math.SQRT2) ** 2 / 2); nearSafe(r.area, 163 + 4 - Math.PI);
    for (const z of [m, s, r]) expect(verifyZone(L, z).ok).toBe(true);
    expect(m.corners.find(c => c.vertex === 3)!.reflex).toBe(true);
  });
  it("ارتدادان مختلفان عند الزاوية المقعّرة (3 و 2): miter = 146", () => {
    const L = shift([[0, 0], [30, 0], [30, 10], [12, 10], [12, 25], [0, 25]]), d = [5, 3, 3, 2, 4, 3];
    const z = buildableZone(L, d, { join: "miter" });
    nearSafe(z.area, 24 * 2 + 7 * 14);
    expect(verifyZone(L, z).ok).toBe(true);
  });
  it("حد miter: شق ضيق (زاوية 330°) يتحول إلى قطع مستقيم ويبقى صحيحاً", () => {
    const r = shift([[0, 0], [40, 0], [40, 30], [21, 30], [20, 12], [19, 30], [0, 30]]), d = Array(7).fill(2);
    const z = buildableZone(r, d, { join: "miter", miterLimit: 3 });
    const c = z.corners.find(k => k.vertex === 4)!;
    expect(c.reflex).toBe(true); expect(c.join).toBe("square");
    expect(verifyZone(r, z).ok).toBe(true);
    const big = buildableZone(r, d, { join: "miter", miterLimit: 100 });
    expect(big.corners.find(k => k.vertex === 4)!.join).toBe("miter");
    expect(big.area).toBeLessThan(z.area);   // التقاطع البعيد يقص أكثر
    expect(verifyZone(r, big).ok).toBe(true);
  });
  it("رأس على خط مستقيم يفصل ارتدادين مختلفين: درجة قائمة عند الرأس", () => {
    const r = shift([[0, 0], [15, 0], [30, 0], [30, 20], [0, 20]]), d = [6, 4, 3, 3, 3];
    const z = buildableZone(r, d, { join: "miter" });
    nearSafe(z.area, 12 * 11 + 12 * 13);
    expect(verifyZone(r, z).ok).toBe(true);
  });
  it("أرض زاوية على شارعين: أمامي 5 على الشارعين وجانبي 3 (لا خلفي)", () => {
    const r = shift([[0, 0], [30, 0], [30, 20], [0, 20]]), types = classifyEdges(r, [0, 1]);
    expect(types).toEqual(["front", "front", "side", "side"]);
    const z = buildableZone(r, types.map(t => (t === "front" ? 5 : 3)));
    nearSafe(z.area, 22 * 12);
  });
  it("أرض زاوية بشارعين بزاوية حادة، وأرض على ثلاثة شوارع", () => {
    const r = shift([[0, 0], [40, 0], [12, 28]]), t = classifyEdges(r, [0, 2]);
    expect(t).toEqual(["front", "side", "front"]);
    const d = t.map(x => (x === "front" ? 5 : 3)), z = buildableZone(r, d);
    nearSafe(z.area, convexExact(r, d));
    const q = shift([[0, 0], [25, 0], [25, 18], [0, 18]]);
    expect(classifyEdges(q, [0, 1, 2])).toEqual(["front", "front", "front", "side"]);
    expect(countStreets(q, [0, 1, 2])).toBe(3);
  });
  it("تصنيف شارع واحد: الضلع المقابل خلفي", () => {
    expect(classifyEdges(shift([[0, 0], [30, 0], [30, 20], [0, 20]]), [0])).toEqual(["front", "side", "back", "side"]);
    expect(classifyEdges(shift([[0, 0], [30, 2], [32, 26], [4, 31], [-2, 14]]), [0])).toEqual(["front", "side", "back", "side", "side"]);
    // ضلعان متتاليان على نفس الشارع = شارع واحد
    expect(countStreets(shift([[0, 0], [15, 0.3], [30, 0], [30, 20], [0, 20]]), [0, 1])).toBe(1);
  });
  it("ضلع قصير جداً ورأس بزاوية 179.9° من ضجيج الرفع", () => {
    const r = shift([[0, 0], [20, 0], [20.3, 0.0005], [35, 0], [35, 25], [0, 25]]), d = [5, 5, 5, 3, 3, 3];
    for (const join of JOINS) { const z = buildableZone(r, d, { join }); expect(z.ok).toBe(true); expect(verifyZone(r, z).ok).toBe(true); }
  });
  it("ارتدادات أكبر من الأرض، وأرض تنقسم منطقتها لجزأين", () => {
    const R = shift([[0, 0], [30, 0], [30, 20], [0, 20]]);
    const z = buildableZone(R, [12, 3, 12, 3]); expect(z.parts.length).toBe(0); expect(z.msg).toContain("لا تبقى");
    const H = shift([[0, 0], [12, 0], [12, 10], [16, 10], [16, 0], [28, 0], [28, 14], [0, 14]]);
    const zh = buildableZone(H, Array(8).fill(2.5)); expect(zh.parts.length).toBe(2); expect(verifyZone(H, zh).ok).toBe(true);
  });
  it("الإحداثيات: إزاحة كل الأرض لا تغير المساحة، وعكس ترتيب الرؤوس يعطي نفس النتيجة", () => {
    const base: P[] = [[0, 0], [30, 2], [32, 26], [4, 31], [-2, 14]], d = [5, 3.5, 3, 2.25, 1];
    const a = buildableZone(base, d).area, b = buildableZone(shift(base, 219876.5, 634512.25), d).area;   // ITM
    expect(Math.abs(a - b)).toBeLessThan(0.005);
    const rev = base.slice().reverse(), n = 5, dr = Array.from({ length: n }, (_, i) => d[(n - 2 - i + n) % n]);
    expect(Math.abs(buildableZone(rev, dr).area - a)).toBeLessThan(0.005);
  });
});

describe("خصائص عامة على أراضٍ عشوائية", () => {
  it("3000 أرض عشوائية (3–14 ضلعاً، مقعّرة ومحدّبة، ارتدادات 0–6 م) × 3 وصلات: صفر مخالفات", () => {
    let bad = 0, n = 0;
    for (const seed0 of [7, 2024]) {
      let s0 = seed0; const R = () => ((s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let k = 0; k < 500; k++) {
        const m = 3 + Math.floor(R() * 12), angs = Array.from({ length: m }, () => R() * 2 * Math.PI).sort((a, b) => a - b), R0 = 8 + R() * 40;
        const r = angs.map(t => { const rr = R0 * (0.3 + R() * 0.9); return [170000 + rr * Math.cos(t), 180000 + rr * Math.sin(t)] as P; });
        if (!G.analyzeParcel(r).valid) continue;
        const d = r.map(() => (R() < 0.15 ? 0 : Math.round(R() * 60) / 10));
        for (const join of JOINS) {
          const z = buildableZone(r, d, { join, miterLimit: 1 + R() * 4 }); if (!z.ok) continue; n++;
          expect(z.verified).toBe(true);
          if (!verifyZone(r, z, 0.1).ok) bad++;
        }
      }
    }
    expect(n).toBeGreaterThan(2500); expect(bad).toBe(0);
  }, 300000);
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  function randomParcel(): P[] {
    const n = 4 + Math.floor(rnd() * 8), angs = Array.from({ length: n }, () => rnd() * 2 * Math.PI).sort((a, b) => a - b), R0 = 12 + rnd() * 25;
    return angs.map(t => { const R = R0 * (0.45 + rnd() * 0.75); return [OX + R * Math.cos(t), OY + R * Math.sin(t)] as P; });
  }
  it("300 أرض × 3 وصلات: المنطقة داخل الأرض، المُحقِّق لا يجد مخالفة، وزيادة الارتداد لا تكبّر المنطقة", () => {
    let tested = 0;
    for (let k = 0; k < 300; k++) {
      const r = randomParcel(); if (!G.analyzeParcel(r).valid) continue;
      const d = r.map(() => Math.round(rnd() * 40) / 10);
      for (const join of JOINS) {
        const z = buildableZone(r, d, { join }); if (!z.ok) continue;
        const f = new IntFrame(r[0][0], r[0][1]);
        expect(outsideArea(f, z.parts.map(p => p.outer), [r])).toBe(0);
        const v = verifyZone(r, z, 0.1);
        if (!v.ok) throw new Error(`مخالفة ${join}: ${JSON.stringify({ r, d, v: v.violations[0] })}`);
        const z2 = buildableZone(r, d.map(x => x + 0.5), { join });
        expect(z2.area).toBeLessThanOrEqual(z.area + 1e-6);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(600);
  });
  it("المُحقِّق يكتشف المخالفة فعلاً", () => {
    const R = shift([[0, 0], [30, 0], [30, 20], [0, 20]]);
    const v = verifyPoints(R, [5, 3, 4, 2], "miter", 3, samplesOf([R.map(p => [p[0], p[1]] as P)]));
    expect(v.ok).toBe(false);
  });
});

describe("احتواء مبنى داخل المنطقة", () => {
  it("مبنى على خط الارتداد تماماً مقبول، ومبنى يتجاوز بملليمتر واحد مرفوض", () => {
    const R = shift([[0, 0], [30, 0], [30, 20], [0, 20]]), z = buildableZone(R, [5, 3, 4, 2]);
    const inside = shift([[2, 5], [27, 5], [27, 16], [2, 16]]);
    expect(checkFootprint(R, z, inside).ok).toBe(true);
    const over = shift([[2, 4.999], [27, 4.999], [27, 16], [2, 16]]);
    const c = checkFootprint(R, z, over); expect(c.ok).toBe(false); expect(c.verify.violations[0].edge).toBe(0);
    // أرض L بزاوية مقعّرة: مبنى يدخل في قطع الزاوية مرفوض
    const L = shift([[0, 0], [30, 0], [30, 10], [12, 10], [12, 25], [0, 25]]), zl = buildableZone(L, [5, 3, 2, 2, 4, 3]);
    expect(checkFootprint(L, zl, shift([[3, 5], [10, 5], [10, 21], [3, 21]])).ok).toBe(true);
    expect(checkFootprint(L, zl, shift([[3, 5], [10.5, 5], [10.5, 21], [3, 21]])).ok).toBe(false);
  });
});

describe("الشرح المبسّط", () => {
  it("يذكر المساحة والحد الفعلي ونتيجة التحقق", () => {
    const R = shift([[0, 0], [30, 0], [30, 20], [0, 20]]), z = buildableZone(R, [5, 3, 4, 3]);
    const e = explain(z, ["front", "side", "back", "side"], 1, 30, 3, verifyZone(R, z));
    expect(e.limitedBy).toBe("coverage"); expect(e.allowed).toBeCloseTo(180, 6);
    expect(e.lines.map(l => l.text).join(" ")).toContain("تحقق مستقل");
  });
});
