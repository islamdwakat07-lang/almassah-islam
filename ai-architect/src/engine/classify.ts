/**
 * تصنيف الأضلاع تلقائياً بعد أن يحدد المستخدم أضلاع الشوارع:
 *  • شارع واحد: أضلاع الشارع أمامية، والضلع/الأضلاع المقابلة للشارع خلفية، والباقي جانبي.
 *  • أكثر من شارع (أرض زاوية): كل ضلع على شارع أمامي، وكل الباقي جانبي، ولا يوجد خلفي.
 * «شارع» هنا = اتجاه شارع؛ ضلعان متتاليان تقريباً على نفس الخط يُعتبران نفس الشارع.
 */
import { Ring, cleanRing, signedArea } from "./geometry";

export type EdgeType = "front" | "side" | "back";

const angOf = (r: Ring, i: number) => { const a = r[i], b = r[(i + 1) % r.length]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
const angDiff = (x: number, y: number) => { const d = Math.abs(x - y) % Math.PI; return Math.min(d, Math.PI - d); };

/** عدد الشوارع المختلفة: الأضلاع المختارة المتتالية والمتقاربة الاتجاه (< 20°) = شارع واحد */
export function countStreets(pts: ReadonlyArray<ReadonlyArray<number>>, streets: number[]): number {
  const r = cleanRing(pts), n = r.length, S = new Set(streets.filter(i => i >= 0 && i < n));
  if (!S.size) return 0;
  let groups = 0;
  const seen = new Set<number>();
  for (const i of S) {
    if (seen.has(i)) continue; groups++;
    const stack = [i];
    while (stack.length) {
      const k = stack.pop() as number; if (seen.has(k)) continue; seen.add(k);
      for (const j of [(k + 1) % n, (k - 1 + n) % n]) if (S.has(j) && !seen.has(j) && angDiff(angOf(r, k), angOf(r, j)) < 20 * Math.PI / 180) stack.push(j);
    }
  }
  return groups;
}

export function classifyEdges(pts: ReadonlyArray<ReadonlyArray<number>>, streets: number[]): EdgeType[] {
  const r = cleanRing(pts), n = r.length, S = new Set(streets.filter(i => i >= 0 && i < n));
  const t: EdgeType[] = Array.from({ length: n }, (_, i) => (S.has(i) ? "front" : "side"));
  if (!S.size || countStreets(r, [...S]) > 1) return t;
  // شارع واحد: الخلفي = الأضلاع البعيدة عن الشارع والموازية له تقريباً
  const ccw = signedArea(r) > 0, main = [...S].sort((a, b) => len(b) - len(a))[0];
  const a = r[main], b = r[(main + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = ccw ? -uy : uy, ny = ccw ? ux : -ux;
  const depth = (p: number[]) => (p[0] - a[0]) * nx + (p[1] - a[1]) * ny;
  const D = Math.max(...r.map(depth));
  let best = -1, bestDepth = -Infinity;
  for (let i = 0; i < n; i++) {
    if (S.has(i)) continue;
    const m = [(r[i][0] + r[(i + 1) % n][0]) / 2, (r[i][1] + r[(i + 1) % n][1]) / 2], dep = depth(m);
    if (angDiff(angOf(r, i), angOf(r, main)) < 35 * Math.PI / 180 && dep > D * 0.55) t[i] = "back";
    if (dep > bestDepth && angDiff(angOf(r, i), angOf(r, main)) < 60 * Math.PI / 180) { bestDepth = dep; best = i; }
  }
  if (!t.includes("back") && best >= 0 && bestDepth > D * 0.55) t[best] = "back";
  return t;
  function len(i: number) { const p = r[i], q = r[(i + 1) % n]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }
}
