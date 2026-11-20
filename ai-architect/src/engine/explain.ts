/**
 * شرح النتائج بلغة بسيطة للهواة. نصوص ثابتة تُملأ بأرقام المحرك (لا ذكاء اصطناعي ولا تخمين).
 */
import type { ZoneResult } from "./setbacks";
import type { EdgeType } from "./classify";
import type { VerifyResult } from "./verify";

export interface Line { tone: "ok" | "info" | "warn" | "err"; text: string }
export interface Explanation { allowed: number; limitedBy: "setbacks" | "coverage" | "none"; lines: Line[] }

const f2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const JOIN_AR = { miter: "تقاطع خطَّي الارتداد (زاوية حادة)", square: "قطع مستقيم", round: "قوس دائري" } as const;

export function explain(z: ZoneResult, types: EdgeType[], streets: number, coverage: number | null, maxFloors: number | null, ver?: VerifyResult): Explanation {
  const L: Line[] = [], A = z.parcelArea;
  if (!z.info.valid) return { allowed: 0, limitedBy: "none", lines: [{ tone: "err", text: z.msg }] };
  L.push({ tone: "info", text: `مساحة أرضك ${f2(A)} م² (${(A / 1000).toFixed(3)} دونم).` });
  if (!streets) L.push({ tone: "warn", text: "لم تحدد الشارع بعد. اضغط على ضلع الشارع في الرسم حتى أعرف أي الأضلاع أمامية وأيها جانبية وخلفية." });
  else if (streets > 1) L.push({ tone: "info", text: `أرضك على ${streets} شوارع: كل ضلع على شارع أخذ الارتداد الأمامي، وباقي الأضلاع جانبية ولا يوجد خلفي.` });

  if (!z.parts.length) {
    L.push({ tone: "err", text: "بهذه الارتدادات لا تبقى أي مساحة للبناء. جرّب ارتدادات أصغر، أو تأكد من أرقام الاشتراطات." });
    return { allowed: 0, limitedBy: "setbacks", lines: L };
  }
  L.push({ tone: "ok", text: `بعد الارتدادات تبقى ${f2(z.area)} م² يمكن البناء داخلها، أي ${(z.ratio * 100).toFixed(1)}% من الأرض. الارتدادات أخذت ${f2(A - z.area)} م².` });
  if (z.parts.length > 1) L.push({ tone: "warn", text: `المنطقة الصالحة انقسمت إلى ${z.parts.length} أجزاء منفصلة لأن الأرض ضيقة في بعض المواضع. المبنى الواحد يجب أن يكون داخل جزء واحد (أكبرها ${f2(z.parts[0].outer.length ? partA(z.parts[0]) : 0)} م²).` });

  let allowed = z.area, limitedBy: Explanation["limitedBy"] = "setbacks";
  if (coverage && coverage > 0) {
    const cov = A * coverage / 100;
    if (cov < z.area) { allowed = cov; limitedBy = "coverage"; L.push({ tone: "info", text: `نسبة البناء ${coverage}% تسمح بـ ${f2(cov)} م² للطابق، وهي أقل من المساحة بعد الارتدادات. إذن أقصى مساحة للطابق ${f2(cov)} م²، وتختار مكانها داخل المنطقة الخضراء.` }); }
    else L.push({ tone: "info", text: `نسبة البناء ${coverage}% تسمح بـ ${f2(cov)} م²، لكن الارتدادات أضيق منها، لذلك الحد الفعلي للطابق ${f2(z.area)} م².` });
  }
  if (maxFloors && maxFloors > 0) L.push({ tone: "info", text: `بحد أقصى ${maxFloors} طوابق بنفس المساحة، يكون مجموع البناء حتى ${f0(allowed * maxFloors)} م² تقريباً.` });

  for (const c of z.corners) {
    if (!c.reflex && c.join === "convex" && c.angle < 45 && c.dMax > 0) L.push({ tone: "warn", text: `الزاوية عند الرأس ${c.vertex + 1} حادة (${c.angle.toFixed(0)}°)، فخطّا الارتداد يلتقيان بعيداً داخل الأرض وتضيع مساحة قرب هذه الزاوية.` });
  }
  const reflex = z.corners.filter(c => c.reflex && c.dMax > 0);
  if (reflex.length) {
    const sq = reflex.filter(c => c.join === "square" && z.join === "miter");
    L.push({ tone: "info", text: `في الأرض ${reflex.length === 1 ? "زاوية داخلية واحدة (أكبر من 180°)" : reflex.length + " زوايا داخلية (أكبر من 180°)"} عند ${reflex.map(c => "الرأس " + (c.vertex + 1)).join("، ")}. حُسب الارتداد عندها بطريقة: ${JOIN_AR[z.join]}.` });
    if (sq.length) L.push({ tone: "warn", text: `عند ${sq.map(c => "الرأس " + (c.vertex + 1)).join("، ")} كان تقاطع خطَّي الارتداد سيبتعد كثيراً ويقص مساحة كبيرة، فاستُخدم قطع مستقيم بدلاً منه (حد التقاطع ${z.miterLimit}× الارتداد).` });
  }
  if (types.every(t => t !== "back") && streets === 1) L.push({ tone: "info", text: "لم أجد ضلعاً مقابلاً للشارع ليكون خلفياً، فاعتُبرت كل الأضلاع الأخرى جانبية. تستطيع تغيير نوع أي ضلع." });
  if (ver) L.push(ver.ok ? { tone: "ok", text: `تحقق مستقل: فحصت ${f0(ver.checked)} نقطة على حدود المنطقة، ولا توجد أي نقطة أقرب للحدود من الارتداد المطلوب.` } : { tone: "err", text: `تحقق مستقل: وُجدت ${ver.violations.length} مخالفة للارتداد. لا تعتمد هذه النتيجة وأبلغ عن المشكلة.` });
  return { allowed, limitedBy, lines: L };
}
function partA(p: { outer: Array<[number, number]>; holes: Array<Array<[number, number]>> }) {
  const a = (r: Array<[number, number]>) => { let s = 0; for (let i = 0; i < r.length; i++) { const u = r[i], v = r[(i + 1) % r.length]; s += (u[0] - r[0][0]) * (v[1] - r[0][1]) - (v[0] - r[0][0]) * (u[1] - r[0][1]); } return Math.abs(s / 2); };
  return a(p.outer) - p.holes.reduce((s, h) => s + a(h), 0);
}
