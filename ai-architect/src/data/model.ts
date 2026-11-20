/**
 * نموذج بيانات المشروع (نسخة المخطط 2).
 * الاشتراطات التنظيمية جزء من كل مشروع (لا يوجد نظام موحد مفترض)،
 * والمراحل القادمة تُضاف داخل `stages` دون تغيير ما قبلها.
 */
import type { JoinType } from "../engine/setbacks";
import { classifyEdges, EdgeType } from "../engine/classify";

export const SCHEMA_VERSION = 2;

export interface Rules {
  profileName: string;          // اسم النظام (بلدية/منطقة) أو «مخصّص»
  front: number; side: number; back: number;
  secondFront: number | null;   // ارتداد الشارع الثاني في أرض الزاوية (فارغ = نفس الأمامي)
  join: JoinType; miterLimit: number;
  coverage: number | null;      // نسبة البناء القصوى للطابق %
  maxFloors: number | null; maxHeight: number | null;
  notes: string;
}
export interface EdgeSetting { type: EdgeType; d: number | null; manualType: boolean }
export interface Project {
  schema: number; id: string; name: string; createdAt: number; updatedAt: number;
  meta: { town: string; block: string; parcel: string; notes: string };
  crs: { units: "m"; source: string };
  parcel: { vertices: Array<{ x: number; y: number }>; closed: boolean };
  streets: number[];
  edges: EdgeSetting[];
  rules: Rules;
  stages: Record<string, unknown>;
}

export const TYPE_LABEL: Record<EdgeType, string> = { front: "أمامي (شارع)", side: "جانبي", back: "خلفي" };

/** قيم مبدئية فقط للبدء؛ يجب تعديلها حسب اشتراطات البلدية */
export const STARTER_RULES: Rules = {
  profileName: "مخصّص", front: 5, side: 3, back: 3, secondFront: null, join: "miter", miterLimit: 3,
  coverage: null, maxFloors: null, maxHeight: null, notes: ""
};

export function newId(): string {
  const a = new Uint8Array(8);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256)));
  return "p" + Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

export function newProject(name = "مشروع جديد", meta: Partial<Project["meta"]> = {}, rules: Partial<Rules> = {}): Project {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION, id: newId(), name, createdAt: now, updatedAt: now,
    meta: { town: "", block: "", parcel: "", notes: "", ...meta }, crs: { units: "m", source: "" },
    parcel: { vertices: [], closed: false }, streets: [], edges: [], rules: { ...STARTER_RULES, ...rules }, stages: {}
  };
}

export const ringOf = (p: Project): Array<[number, number]> => p.parcel.vertices.map(v => [v.x, v.y]);

/** يضبط عدد الأضلاع ويعيد التصنيف التلقائي للأضلاع غير المعدّلة يدوياً */
export function normalize(p: Project): Project {
  const n = p.parcel.closed ? p.parcel.vertices.length : 0;
  p.streets = [...new Set(p.streets.filter(i => i >= 0 && i < n))].sort((a, b) => a - b);
  const auto = n >= 3 ? classifyEdges(ringOf(p), p.streets) : [];
  const out: EdgeSetting[] = [];
  for (let i = 0; i < n; i++) {
    const e = p.edges[i];
    if (e && e.manualType) out.push({ ...e, type: p.streets.includes(i) ? "front" : e.type });
    else out.push({ type: auto[i] || "side", d: e ? e.d : null, manualType: false });
  }
  p.edges = out;
  return p;
}

/** الارتداد الفعلي لكل ضلع: القيمة الخاصة بالضلع إن وُجدت، وإلا قيمة نوعه من الاشتراطات */
export function effectiveSetbacks(p: Project): number[] {
  const r = ringOf(p), n = r.length, R = p.rules;
  // الشارع الرئيسي = أطول ضلع شارع؛ أضلاع الشوارع باتجاه مختلف (> 20°) تأخذ ارتداد الشارع الثاني إن حُدد
  const len = (i: number) => Math.hypot(r[(i + 1) % n][0] - r[i][0], r[(i + 1) % n][1] - r[i][1]);
  const ang = (i: number) => Math.atan2(r[(i + 1) % n][1] - r[i][1], r[(i + 1) % n][0] - r[i][0]);
  const fronts = p.edges.map((e, i) => (e.type === "front" ? i : -1)).filter(i => i >= 0);
  const main = fronts.sort((a, b) => len(b) - len(a))[0];
  return p.edges.map((e, i) => {
    if (e.d != null && Number.isFinite(e.d)) return Math.max(0, e.d);
    if (e.type === "front") {
      if (R.secondFront != null && main !== undefined && i !== main) { const d = Math.abs(ang(i) - ang(main)) % Math.PI; if (Math.min(d, Math.PI - d) > 20 * Math.PI / 180) return R.secondFront; }
      return R.front;
    }
    return e.type === "back" ? R.back : R.side;
  });
}

/** ترقية أي مشروع قديم (المرحلة الأولى كانت نسخة 1) */
export function migrate(raw: any): Project | null {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  const base = newProject(raw.name || "مشروع");
  const p: Project = {
    ...base, ...raw,
    meta: { ...base.meta, ...(raw.meta || {}) }, crs: { ...base.crs, ...(raw.crs || {}) },
    parcel: { vertices: (raw.parcel?.vertices || []).filter((v: any) => v && Number.isFinite(+v.x) && Number.isFinite(+v.y)).map((v: any) => ({ x: +v.x, y: +v.y })), closed: !!raw.parcel?.closed },
    streets: Array.isArray(raw.streets) ? raw.streets.map(Number) : [],
    edges: Array.isArray(raw.edges) ? raw.edges.map((e: any) => ({ type: e.type === "front" || e.type === "back" ? e.type : "side", d: e.d == null ? null : +e.d, manualType: !!e.manualType })) : [],
    rules: { ...STARTER_RULES, ...(raw.rules || {}) }, stages: { ...(raw.stages || {}) }
  };
  if ((raw.schema || 1) < 2 && raw.setbacks) {   // مشروع من المرحلة الأولى
    const D = raw.setbacks.defaults || {};
    p.rules = { ...p.rules, front: +D.front || 5, side: +D.side || 3, back: +D.back || 3, join: "round" };
    p.edges = (raw.setbacks.edges || []).map((e: any) => ({ type: e.type === "custom" ? "side" : e.type, d: e.type === "custom" || +e.d !== +(D[e.type] ?? NaN) ? +e.d : null, manualType: true }));
    p.streets = p.edges.map((e, i) => (e.type === "front" ? i : -1)).filter(i => i >= 0);
  }
  p.schema = SCHEMA_VERSION;
  return normalize(p);
}
