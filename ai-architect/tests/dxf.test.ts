import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDXF } from "../src/io/dxf-read";
import { writeDXF, encodeText } from "../src/io/dxf-write";
import { buildDXF } from "../src/io/export";
import * as G from "../src/engine/geometry";
import { buildableZone } from "../src/engine/setbacks";
import { newProject, effectiveSetbacks } from "../src/data/model";
import * as ops from "../src/data/ops";

const DIR = join(__dirname, "fixtures");
const expected = JSON.parse(readFileSync(join(DIR, "expected.json"), "utf8"));
const load = (name: string) => parseDXF(new Uint8Array(readFileSync(join(DIR, name))));
/** نفس الحلقة مع احتمال اختلاف نقطة البداية أو الاتجاه */
function sameRing(a: number[][], b: number[][], tol = 0) {
  if (a.length !== b.length) return false;
  const n = a.length, eq = (p: number[], q: number[]) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;
  for (const dir of [1, -1]) for (let s = 0; s < n; s++) { let ok = true; for (let i = 0; i < n && ok; i++) ok = eq(a[i], b[(s + dir * i + n * 2) % n]); if (ok) return true; }
  return false;
}

describe("قراءة ملفات DXF حقيقية", () => {
  for (const name of Object.keys(expected)) {
    it(name, () => {
      const E = expected[name], r = load(name);
      const loop = r.loops.find(l => l.layer === E.layer);
      expect(loop, `لم أجد حدوداً على الطبقة ${E.layer}`).toBeTruthy();
      if (E.arc) { expect(loop!.hadArcs).toBe(true); expect(Math.abs(loop!.area - E.area)).toBeLessThan(0.05); return; }
      // الإحداثيات مطابقة بالبت (أو بسماحية الدوران للكتل)
      expect(sameRing(loop!.points, E.points, E.tolerance || 0)).toBe(true);
      const a = G.analyzeParcel(loop!.points);
      expect(Math.abs((a.area as number) - E.area)).toBeLessThan(1e-6);
      const angs = (a.angles as number[]).slice().sort((x, y) => x - y), ea = (E.angles as number[]).slice().sort((x, y) => x - y);
      angs.forEach((v, i) => expect(v).toBeCloseTo(ea[i], 6));
    });
  }
  it("الطبقات المتعددة تُقرأ وتُعرض للاختيار، والأكبر أولاً", () => {
    const r = load("pentagon_r2000.dxf");
    expect(r.layers).toEqual(expect.arrayContaining(["حدود القطعة", "مبنى قائم", "ROADS", "TEXT"]));
    expect(r.loops[0].layer).toBe("حدود القطعة");
    expect(r.loops.some(l => l.layer === "مبنى قائم")).toBe(true);
    expect(r.version).toBe("AC1015");
  });
  it("وحدة المتر ونسخة الملف", () => {
    expect(load("hexagon_r2018.dxf").units).toBe(6);
    expect(load("hexagon_r2018.dxf").version).toBe("AC1032");
  });
  it("زوايا حادة ومنفرجة في الخماسي", () => {
    const a = G.analyzeParcel(expected["pentagon_r2000.dxf"].points);
    expect(Math.min(...(a.angles as number[]))).toBeLessThan(90);
    expect(Math.max(...(a.angles as number[]))).toBeGreaterThan(90);
  });
});

describe("كتابة DXF والحفاظ على الإحداثيات", () => {
  it("كتابة ثم قراءة: نفس الإحداثيات بالبت لـ 2000 نقطة عشوائية بإحداثيات فلسطين و ITM", () => {
    for (let k = 0; k < 2000; k++) {
      const x = 100000 + Math.random() * 200000, y = 100000 + Math.random() * 700000;
      const t = writeDXF({ layers: [{ name: "P", color: 7 }], polylines: [{ points: [[x, y], [x + 1.1, y], [x, y + 2.3]], closed: true, layer: "P" }] });
      const q = parseDXF(t).loops[0].points;
      expect(sameRing(q, [[x, y], [x + 1.1, y], [x, y + 2.3]])).toBe(true);
    }
  });
  it("ذهاب وإياب لكل ملفات الاختبار: قراءة ← تصدير مشروع ← قراءة = نفس الحدود والمساحة", () => {
    for (const name of Object.keys(expected)) {
      const E = expected[name]; if (E.arc) continue;
      const loop = load(name).loops.find(l => l.layer === E.layer)!;
      let p = newProject("اختبار");
      p = ops.setVertices(p, loop.points, true);
      p = ops.toggleStreet(p, 0);
      const r = loop.points, info = G.analyzeParcel(r), z = buildableZone(r, effectiveSetbacks(p));
      const txt = buildDXF(p, info, z);
      const back = parseDXF(txt);
      const parcel = back.loops.find(l => l.layer === "PARCEL")!;
      expect(sameRing(parcel.points, r)).toBe(true);
      expect(parcel.area).toBe(G.area(r));
      const zoneBack = back.loops.filter(l => l.layer === "BUILDABLE_ZONE").reduce((s, l) => s + l.area, 0);
      expect(Math.abs(zoneBack - z.area)).toBeLessThan(1e-6);
    }
  });
  it("النص العربي يُكتب بترميز \\U+ الذي يفهمه أوتوكاد", () => {
    expect(encodeText("مساحة A")).toBe("\\U+0645\\U+0633\\U+0627\\U+062D\\U+0629 A");
    const t = writeDXF({ layers: [{ name: "حدود", color: 7 }], polylines: [{ points: [[0, 0], [1, 0], [0, 1]], closed: true, layer: "حدود" }] });
    expect(parseDXF(t).loops[0].layer).toBe("حدود");
  });
});
