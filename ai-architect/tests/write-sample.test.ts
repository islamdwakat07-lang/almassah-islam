import { writeFileSync, mkdirSync } from "node:fs";
import { buildDXF } from "../src/io/export";
import { newProject, effectiveSetbacks, ringOf } from "../src/data/model";
import * as ops from "../src/data/ops";
import * as G from "../src/engine/geometry";
import { buildableZone } from "../src/engine/setbacks";
it("يكتب ملف DXF نموذجي للفحص الخارجي (ezdxf / أوتوكاد)", () => {
  let p = newProject("فحص");
  p = ops.setVertices(p, [[170500.1234, 181000.5678], [170545.0217, 181001.0013], [170533.5017, 181026.2549], [170504.7512, 181031.8761], [170497.9988, 181014.5002]]);
  p = ops.toggleStreet(p, 0);
  const r = ringOf(p), z = buildableZone(r, effectiveSetbacks(p));
  mkdirSync("e2e/out", { recursive: true });
  writeFileSync("e2e/out/sample-export.dxf", buildDXF(p, G.analyzeParcel(r), z));
});
