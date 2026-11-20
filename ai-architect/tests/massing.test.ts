import { describe, it, expect } from "vitest";
import { buildableZone } from "../src/engine/setbacks";
import { generateMassing } from "../src/engine/massing";
import { checkFootprint } from "../src/engine/verify";

type P = [number, number];
const OX = 170123.456, OY = 181234.567;
const shift = (r: P[]): P[] => r.map(([x, y]) => [x + OX, y + OY]);
const run = (R: P[], sb: number[], target: number, fronts = [0], cov: number | null = null) => {
  const z = buildableZone(R, sb); return { z, m: generateMassing({ parcel: R, zone: z, fronts, setbacks: sb, target, coverageMax: cov }) };
};
const ring = (o: any) => o.ring as P[];
const minY = (r: P[]) => Math.min(...r.map(p => p[1])) - OY, maxX = (r: P[]) => Math.max(...r.map(p => p[0])) - OX, minX = (r: P[]) => Math.min(...r.map(p => p[0])) - OX;

describe("المرحلة 2: أشكال المبنى", () => {
  const R = shift([[0, 0], [30, 0], [30, 20], [0, 20]]);   // الشارع على الضلع 1–2 (y=0)
  it("مستطيل 30×20، ارتداد 5/3/4/3، مطلوب 150 م²: يملأ العرض 24 م وعمقه 6.25 م ملاصق لخط الارتداد الأمامي", () => {
    const { m } = run(R, [5, 3, 4, 3], 150);
    expect(m.ok).toBe(true);
    const f = m.options.find(o => o.kind === "full")!;
    expect(f.area).toBeCloseTo(150, 3); expect(f.width).toBeCloseTo(24, 3); expect(f.depth).toBeCloseTo(6.25, 3);
    expect(minY(ring(f))).toBeCloseTo(5, 3); expect(minX(ring(f))).toBeCloseTo(3, 3); expect(maxX(ring(f))).toBeCloseTo(27, 3);
    expect(f.frontGap).toBeCloseTo(5, 3);
  });
  it("المستطيل المتناسق: وسط/يمين/يسار بنفس المساحة، اليمين واليسار ملاصقان للارتداد الجانبي", () => {
    const { m } = run(R, [5, 3, 4, 3], 150);
    const c = m.options.find(o => o.kind === "center")!, r = m.options.find(o => o.kind === "right")!, l = m.options.find(o => o.kind === "left")!;
    for (const o of [c, r, l]) { expect(o.area).toBeCloseTo(150, 3); expect(minY(ring(o))).toBeCloseTo(5, 3); }
    // الشارع جنوباً والناظر من الشارع يتجه شمالاً: يمينه الشرق (x أكبر)
    expect(maxX(ring(r))).toBeCloseTo(27, 3); expect(minX(ring(l))).toBeCloseTo(3, 3);
    expect((minX(ring(c)) - 3)).toBeCloseTo(27 - maxX(ring(c)), 3);
  });
  it("مساحة أكبر من نسبة البناء تُقص للحد المسموح", () => {
    const { m } = run(R, [5, 3, 4, 3], 250, [0], 180);
    expect(m.capped).toBe("coverage"); expect(m.used).toBe(180);
    expect(m.options.find(o => o.kind === "full")!.area).toBeCloseTo(180, 3);
  });
  it("مساحة أكبر من المنطقة كلها تُقص لمساحة المنطقة (264)", () => {
    const { m } = run(R, [5, 3, 4, 3], 400);
    expect(m.capped).toBe("zone"); expect(m.used).toBeCloseTo(264, 1); expect(m.ok).toBe(true);
  });
  it("أرض شبه منحرف بجوانب مائلة: «يتبع خطوط الارتداد» يحقق المساحة بالضبط ويستغل أكثر من المستطيل", () => {
    const T = shift([[0, 0], [24, 0], [20, 30], [4, 30]]);
    const { z, m } = run(T, [4, 2, 3, 2], 200);
    const fill = m.options.find(o => o.kind === "fill")!, full = m.options.find(o => o.kind === "full")!;
    expect(fill.area).toBeCloseTo(200, 2); expect(full.area).toBeCloseTo(200, 2);
    expect(fill.depth).toBeLessThan(full.depth);   // أقل عمقاً لأنه يستغل الزوايا المائلة
    expect(checkFootprint(T, z, fill.ring).ok).toBe(true);
  });
  it("أرض زاوية على شارعين: خيارات لكل شارع وكلها ملاصقة لخطَي الارتداد الأماميين عند الطرف", () => {
    const { m } = run(R, [5, 5, 3, 3], 120, [0, 1]);
    expect(new Set(m.options.map(o => o.front))).toEqual(new Set([0, 1]));
    for (const o of m.options) expect(o.verified).toBe(true);
  });
  it("أراضٍ عشوائية غير منتظمة ومقعّرة: كل الخيارات المعروضة تحقق المساحة ولا تتجاوز أي ارتداد", () => {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let shown = 0;
    for (let k = 0; k < 120; k++) {
      const n = 4 + Math.floor(rnd() * 5), pts: P[] = [];
      for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n + rnd() * 0.5, r = 14 + rnd() * 14; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
      const Rr = shift(pts), sb = pts.map(() => +(1 + rnd() * 4).toFixed(2)), fe = Math.floor(rnd() * n);
      const z = buildableZone(Rr, sb); if (!z.ok || !z.parts.length) continue;
      const m = generateMassing({ parcel: Rr, zone: z, fronts: [fe], setbacks: sb, target: z.area * (0.2 + rnd() * 0.5) });
      for (const o of m.options) {
        shown++;
        expect(checkFootprint(Rr, z, o.ring).ok).toBe(true);
        expect(Math.abs(o.area - m.used)).toBeLessThan(0.01);
      }
    }
    expect(shown).toBeGreaterThan(150);
  });
});
