/**
 * أدوات هندسية أساسية – دوال بحتة بدون واجهة أو تخزين.
 * الوحدة: متر. النقطة [x, y]. الحلقة: رؤوس بدون تكرار الأولى في الآخر.
 * الإحداثيات الكبيرة (فلسطين 1923 / ITM) تُزاح لنقطة مرجعية داخل الحسابات لتجنب فقد الدقة.
 */
export type Pt = [number, number];
export type Ring = Pt[];

export const EPS = 1e-9;

export function cleanRing(pts: ReadonlyArray<ReadonlyArray<number>>, tol = 1e-7): Ring {
  const out: Ring = [];
  for (const p of pts) {
    const q: Pt = [Number(p[0]), Number(p[1])];
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > tol) out.push(q);
  }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tol) out.pop();
  return out;
}

export function signedArea(r: Ring): number {
  const n = r.length; if (n < 3) return 0;
  const ox = r[0][0], oy = r[0][1]; let s = 0;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    s += (a[0] - ox) * (b[1] - oy) - (b[0] - ox) * (a[1] - oy);
  }
  return s / 2;
}
export const area = (r: Ring) => Math.abs(signedArea(r));
export const toCCW = (r: Ring): Ring => (signedArea(r) < 0 ? r.slice().reverse() : r.slice());
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const edgeLengths = (r: Ring) => r.map((p, i) => dist(p, r[(i + 1) % r.length]));
export const perimeter = (r: Ring) => edgeLengths(r).reduce((s, v) => s + v, 0);

/** الزاوية الداخلية عند كل رأس (0–360°)، صحيحة للمضلعات المقعّرة وبأي اتجاه للرؤوس */
export function interiorAngles(r: Ring): number[] {
  const n = r.length, ccw = signedArea(r) > 0, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = r[(i - 1 + n) % n], c = r[i], q = r[(i + 1) % n];
    const a1 = Math.atan2(p[1] - c[1], p[0] - c[0]), a2 = Math.atan2(q[1] - c[1], q[0] - c[0]);
    let d = ccw ? a1 - a2 : a2 - a1;
    d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    out.push(d * 180 / Math.PI);
  }
  return out;
}

/** اتجاه الضلع من الشمال مع عقارب الساعة */
export const bearings = (r: Ring) => r.map((a, i) => { const b = r[(i + 1) % r.length]; return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360; });

export function bbox(r: ReadonlyArray<Pt>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function centroid(r: Ring): Pt {
  const n = r.length, A = signedArea(r);
  if (n < 3 || Math.abs(A) < EPS) { let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); return [x / (n || 1), y / (n || 1)]; }
  const ox = r[0][0], oy = r[0][1]; let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const a = [r[i][0] - ox, r[i][1] - oy], b = [r[(i + 1) % n][0] - ox, r[(i + 1) % n][1] - oy], f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f; cy += (a[1] + b[1]) * f;
  }
  return [ox + cx / (6 * A), oy + cy / (6 * A)];
}

export function closestOnSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return { p: [a[0] + t * dx, a[1] + t * dy] as Pt, t };
}
export const segDist = (p: Pt, a: Pt, b: Pt) => dist(p, closestOnSeg(p, a, b).p);

/** 1 داخل، 0 على الحد، -1 خارج */
export function pointInRing(p: Pt, r: Ring, tol = 1e-9): number {
  for (let i = 0; i < r.length; i++) if (segDist(p, r[i], r[(i + 1) % r.length]) <= tol) return 0;
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c ? 1 : -1;
}

function orient(p: Pt, q: Pt, r: Pt) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
function onSeg(p: Pt, q: Pt, r: Pt) { return Math.min(p[0], r[0]) - EPS <= q[0] && q[0] <= Math.max(p[0], r[0]) + EPS && Math.min(p[1], r[1]) - EPS <= q[1] && q[1] <= Math.max(p[1], r[1]) + EPS; }
export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const s = 1e-12 * Math.max(1, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * Math.hypot(p4[0] - p3[0], p4[1] - p3[1]));
  const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
  if (((d1 > s && d2 < -s) || (d1 < -s && d2 > s)) && ((d3 > s && d4 < -s) || (d3 < -s && d4 > s))) return true;
  if (Math.abs(d1) <= s && onSeg(p3, p1, p4)) return true;
  if (Math.abs(d2) <= s && onSeg(p3, p2, p4)) return true;
  if (Math.abs(d3) <= s && onSeg(p1, p3, p2)) return true;
  if (Math.abs(d4) <= s && onSeg(p1, p4, p2)) return true;
  return false;
}
export function selfIntersections(r: Ring): Array<[number, number]> {
  const n = r.length, bad: Array<[number, number]> = [];
  if (n < 4) return bad;
  // نحسب بإحداثيات محلية لتفادي فقد الدقة
  const o = r[0], L = r.map(p => [p[0] - o[0], p[1] - o[1]] as Pt);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsIntersect(L[i], L[(i + 1) % n], L[j], L[(j + 1) % n])) bad.push([i, j]);
  }
  return bad;
}

export interface ParcelIssue { code: "few" | "zero" | "cross"; msg: string; pairs?: Array<[number, number]> }
export interface ParcelInfo {
  n: number; valid: boolean; issues: ParcelIssue[];
  ring?: Ring; area?: number; ccw?: boolean; perimeter?: number; edges?: number[]; angles?: number[]; bearings?: number[]; centroid?: Pt;
}
export function analyzeParcel(pts: ReadonlyArray<ReadonlyArray<number>>): ParcelInfo {
  const r = cleanRing(pts), n = r.length;
  const res: ParcelInfo = { n, valid: false, issues: [] };
  if (n < 3) { res.issues.push({ code: "few", msg: "الأرض تحتاج 3 رؤوس على الأقل." }); return res; }
  const A = signedArea(r), x = selfIntersections(r);
  if (Math.abs(A) < 1e-6 && !x.length) { res.issues.push({ code: "zero", msg: "مساحة الأرض صفر: الرؤوس على خط واحد." }); return res; }
  if (x.length) res.issues.push({ code: "cross", msg: `الأضلاع تتقاطع (${x.map(([i, j]) => `${i + 1} مع ${j + 1}`).join("، ")}). اسحب الرؤوس لتصحيح الشكل.`, pairs: x });
  const L = edgeLengths(r);
  Object.assign(res, { valid: !x.length, ring: r, area: Math.abs(A), ccw: A > 0, perimeter: L.reduce((s, v) => s + v, 0), edges: L, angles: interiorAngles(r), bearings: bearings(r), centroid: centroid(r) });
  return res;
}

/** الإطار المحلي للأرض: إزاحة لنقطة مرجعية، اتجاهات الأضلاع، العمودي للداخل، الأطوال */
export function frameOf(r: Ring) {
  const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
  const n = r.length, ccw = signedArea(r) > 0, O: Pt = [r[0][0], r[0][1]], L = r.map(p => sub(p, O));
  const len = L.map((p, i) => Math.hypot(L[(i + 1) % n][0] - p[0], L[(i + 1) % n][1] - p[1]));
  const u = L.map((p, i) => [(L[(i + 1) % n][0] - p[0]) / len[i], (L[(i + 1) % n][1] - p[1]) / len[i]] as Pt);
  const nin = u.map(v => (ccw ? [-v[1], v[0]] : [v[1], -v[0]]) as Pt);
  return { n, ccw, O, L, len, u, nin };
}

