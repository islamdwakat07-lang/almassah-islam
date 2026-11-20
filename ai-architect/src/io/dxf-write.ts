/**
 * كتابة DXF بصيغة R12 (AC1009): أبسط صيغة وأوسعها توافقاً مع كل إصدارات أوتوكاد.
 * • الأرقام تُكتب بأقصر تمثيل يعيد القيمة نفسها بالضبط (بدون تقريب).
 * • النص العربي يُكتب بترميز \U+XXXX الذي يفهمه أوتوكاد.
 * • الوحدة متر، والإحداثيات حقيقية كما في ملف المساحة.
 */
export interface DxfDoc {
  layers: Array<{ name: string; color: number; ltype?: "CONTINUOUS" | "DASHED" }>;
  polylines: Array<{ points: Array<[number, number]>; closed: boolean; layer: string }>;
  lines?: Array<{ a: [number, number]; b: [number, number]; layer: string }>;
  texts?: Array<{ p: [number, number]; h: number; s: string; layer: string; rot?: number }>;
}
export function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const s = String(v);
  return /e/i.test(s) ? v.toFixed(Math.min(20, Math.max(0, 16 - Math.floor(Math.log10(Math.abs(v) || 1))))).replace(/\.?0+$/, "") : s;
}
export const encodeText = (s: string) => Array.from(String(s)).map(ch => { const c = ch.codePointAt(0) as number; return c > 126 ? "\\U+" + c.toString(16).toUpperCase().padStart(4, "0") : ch; }).join("");

export function writeDXF(doc: DxfDoc): string {
  const o: string[] = []; const g = (c: number, v: string | number) => { o.push(String(c), String(v)); };
  const all: Array<[number, number]> = [...doc.polylines.flatMap(p => p.points), ...(doc.lines || []).flatMap(l => [l.a, l.b]), ...(doc.texts || []).map(t => t.p)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  all.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  if (!Number.isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$INSBASE"); g(10, 0); g(20, 0); g(30, 0);
  g(9, "$EXTMIN"); g(10, num(x0)); g(20, num(y0)); g(30, 0);
  g(9, "$EXTMAX"); g(10, num(x1)); g(20, num(y1)); g(30, 0);
  g(9, "$LIMMIN"); g(10, num(x0)); g(20, num(y0));
  g(9, "$LIMMAX"); g(10, num(x1)); g(20, num(y1));
  g(9, "$LUNITS"); g(70, 2); g(9, "$LUPREC"); g(70, 4);
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 2);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0);
  g(0, "LTYPE"); g(2, "DASHED"); g(70, 0); g(3, "__ __ __"); g(72, 65); g(73, 2); g(40, 1.5); g(49, 1); g(49, -0.5);
  g(0, "ENDTAB");
  const L = [{ name: "0", color: 7, ltype: "CONTINUOUS" }, ...doc.layers];
  g(0, "TABLE"); g(2, "LAYER"); g(70, L.length);
  L.forEach(l => { g(0, "LAYER"); g(2, encodeText(l.name)); g(70, 0); g(62, l.color); g(6, l.ltype || "CONTINUOUS"); });
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "STYLE"); g(70, 1); g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, "txt"); g(4, ""); g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "BLOCKS"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const pl of doc.polylines) {
    const ly = encodeText(pl.layer);
    g(0, "POLYLINE"); g(8, ly); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, pl.closed ? 1 : 0);
    for (const p of pl.points) { g(0, "VERTEX"); g(8, ly); g(10, num(p[0])); g(20, num(p[1])); g(30, 0); }
    g(0, "SEQEND"); g(8, ly);
  }
  for (const l of doc.lines || []) { g(0, "LINE"); g(8, encodeText(l.layer)); g(10, num(l.a[0])); g(20, num(l.a[1])); g(30, 0); g(11, num(l.b[0])); g(21, num(l.b[1])); g(31, 0); }
  for (const t of doc.texts || []) {
    g(0, "TEXT"); g(8, encodeText(t.layer)); g(10, num(t.p[0])); g(20, num(t.p[1])); g(30, 0); g(40, num(t.h)); g(1, encodeText(t.s));
    if (t.rot) g(50, num(t.rot));
    g(72, 1); g(11, num(t.p[0])); g(21, num(t.p[1])); g(31, 0); g(73, 2);
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return o.join("\r\n") + "\r\n";
}
