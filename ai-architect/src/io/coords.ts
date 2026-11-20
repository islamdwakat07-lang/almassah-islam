/**
 * قراءة إحداثيات من نص ملصوق: ناتج أمر LIST في أوتوكاد (X= … Y= …)،
 * أو أسطر X,Y، أو أعمدة Excel (يتجاهل رقم النقطة والمنسوب).
 * الأرقام تُقرأ كما كُتبت بلا تقريب.
 */
export function parseCoords(txt: string): Array<[number, number]> {
  const t = String(txt || "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/٫/g, ".").replace(/٬/g, "");
  let P: number[][] = [...t.matchAll(/X\s*=\s*(-?\d+(?:\.\d+)?)\s*,?\s*Y\s*=\s*(-?\d+(?:\.\d+)?)/gi)].map(m => [parseFloat(m[1]), parseFloat(m[2])]);
  if (P.length < 3) P = t.split(/\n+/).map(l => {
    const n = (l.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); if (n.length < 2) return null;
    const big = n.filter(v => Math.abs(v) >= 1000);
    return big.length >= 2 ? big.slice(0, 2) : n.slice(0, 2);
  }).filter((x): x is number[] => !!x);
  const out: Array<[number, number]> = [];
  for (const p of P) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push([p[0], p[1]]); }
  if (out.length > 3 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}
