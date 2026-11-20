/**
 * تجهيز DXF من المشروع وحفظه بأفضل طريقة متاحة في المكان الذي يعمل فيه التطبيق.
 */
import { writeDXF, DxfDoc } from "./dxf-write";
import { makeZip } from "./zip";
import { Project, ringOf, effectiveSetbacks } from "../data/model";
import { bbox, dist, ParcelInfo, Pt } from "../engine/geometry";
import type { ZoneResult } from "../engine/setbacks";
import { saveBytes } from "./platform";

const safeName = (s: string) => (String(s || "parcel").replace(/[\\/:*?"<>|]+/g, "-").trim() || "parcel");

export function buildDXF(P: Project, info: ParcelInfo | null, zone: ZoneResult | null): string {
  const r = ringOf(P) as Pt[], n = r.length, b = bbox(r), h = Math.max(0.2, Math.round(Math.max(b.w, b.h) / 70 * 10) / 10);
  const sb = P.parcel.closed ? effectiveSetbacks(P) : [];
  const doc: DxfDoc = { layers: [{ name: "PARCEL", color: 7 }, { name: "BUILDABLE_ZONE", color: 3, ltype: "DASHED" }, { name: "LABELS", color: 2 }, { name: "VERTEX_NO", color: 1 }], polylines: [], texts: [] };
  doc.polylines.push({ points: r, closed: P.parcel.closed, layer: "PARCEL" });
  if (zone && zone.ok) zone.parts.forEach(pt => [pt.outer, ...pt.holes].forEach(ring => doc.polylines.push({ points: ring, closed: true, layer: "BUILDABLE_ZONE" })));
  r.forEach((p, i) => doc.texts!.push({ p, h: h * 0.8, s: String(i + 1), layer: "VERTEX_NO" }));
  if (P.parcel.closed && n >= 3) {
    for (let i = 0; i < n; i++) {
      const a = r[i], c = r[(i + 1) % n]; let ang = Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      doc.texts!.push({ p: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], h, s: `${dist(a, c).toFixed(2)} م · ارتداد ${(sb[i] || 0).toFixed(2)}`, rot: ang, layer: "LABELS" });
    }
    if (info && info.valid && info.centroid) {
      const c = info.centroid;
      doc.texts!.push({ p: c, h: h * 1.4, s: `مساحة الأرض ${(info.area as number).toFixed(2)} م²`, layer: "LABELS" });
      if (zone && zone.ok) doc.texts!.push({ p: [c[0], c[1] - h * 2.4], h, s: `المنطقة الصالحة للبناء ${zone.area.toFixed(2)} م²`, layer: "LABELS" });
    }
  }
  return writeDXF(doc);
}

export async function exportDXF(P: Project, info: ParcelInfo | null, zone: ZoneResult | null): Promise<string> {
  const text = buildDXF(P, info, zone), name = safeName(P.name) + ".dxf", bytes = new TextEncoder().encode(text);
  return saveBytes(name, bytes, "application/dxf", () => ({ name: safeName(P.name) + " DXF.zip", data: makeZip([{ name, data: bytes }]) }));
}
