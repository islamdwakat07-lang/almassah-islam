"""
يولّد ملفات DXF اختبارية بنفس بنية ملفات أوتوكاد الحقيقية (ezdxf يكتب الجداول والمقابض والكائنات كما يفعل أوتوكاد).
تشغيل: python3 tests/fixtures/make_fixtures.py   (يحتاج: pip install ezdxf)
يكتب أيضاً expected.json بالقيم المتوقعة (الإحداثيات كما كُتبت، المساحة، الطبقة).
"""
import ezdxf, json, math, os
from ezdxf.math import Matrix44

HERE = os.path.dirname(os.path.abspath(__file__))
expected = {}

def area(pts):
    ox, oy = pts[0]
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += (a[0] - ox) * (b[1] - oy) - (b[0] - ox) * (a[1] - oy)
    return abs(s) / 2

def angles(pts):
    n, out = len(pts), []
    sgn = 1 if sum((pts[i][0]*pts[(i+1)%n][1]-pts[(i+1)%n][0]*pts[i][1]) for i in range(n)) > 0 else -1
    for i in range(n):
        p, c, q = pts[i-1], pts[i], pts[(i+1) % n]
        a1 = math.atan2(p[1]-c[1], p[0]-c[0]); a2 = math.atan2(q[1]-c[1], q[0]-c[0])
        d = (a1 - a2) if sgn > 0 else (a2 - a1)
        out.append(math.degrees(d % (2*math.pi)))
    return out

def common_layers(doc):
    doc.layers.add("SURVEY_POINTS", color=1)
    doc.layers.add("ROADS", color=8)
    doc.layers.add("TEXT", color=2)
    doc.layers.add("DIMS", color=3)

def decorate(msp, pts):
    # عناصر حقيقية حول الأرض: نقاط رفع، شارع، نصوص
    for i, p in enumerate(pts):
        msp.add_point(p, dxfattribs={"layer": "SURVEY_POINTS"})
        msp.add_text(f"P{i+1}", dxfattribs={"layer": "TEXT", "height": 0.5, "insert": p})
    x0 = min(p[0] for p in pts) - 10; x1 = max(p[0] for p in pts) + 10; y0 = min(p[1] for p in pts) - 6
    msp.add_line((x0, y0), (x1, y0), dxfattribs={"layer": "ROADS"})
    msp.add_line((x0, y0 - 8), (x1, y0 - 8), dxfattribs={"layer": "ROADS"})

def save(doc, name, pts, layer, extra=None):
    doc.saveas(os.path.join(HERE, name))
    expected[name] = {"layer": layer, "points": pts, "area": area(pts), "angles": angles(pts), **(extra or {})}

# 1) مستطيل R12 بإحداثيات فلسطين 1923 (POLYLINE قديم)
pts = [(170412.125, 181025.625), (170442.125, 181025.625), (170442.125, 181045.625), (170412.125, 181045.625)]
doc = ezdxf.new("R12"); common_layers(doc); doc.layers.add("BOUNDARY", color=7)
msp = doc.modelspace(); msp.add_polyline2d(pts, close=True, dxfattribs={"layer": "BOUNDARY"}); decorate(msp, pts)
save(doc, "rect_r12.dxf", pts, "BOUNDARY")

# 2) خماسي غير منتظم R2000 بطبقة عربية وزوايا حادة ومنفرجة (LWPOLYLINE) + مبنى قائم داخلها
pts = [(170500.1234, 181000.5678), (170545.0217, 181001.0013), (170533.5017, 181026.2549), (170504.7512, 181031.8761), (170497.9988, 181014.5002)]
doc = ezdxf.new("R2000"); common_layers(doc); doc.layers.add("حدود القطعة", color=7); doc.layers.add("مبنى قائم", color=5)
msp = doc.modelspace(); msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "حدود القطعة"})
msp.add_lwpolyline([(170510, 181010), (170520, 181010), (170520, 181018), (170510, 181018)], close=True, dxfattribs={"layer": "مبنى قائم"})
decorate(msp, pts)
save(doc, "pentagon_r2000.dxf", pts, "حدود القطعة")

# 3) سداسي غير منتظم R2018 بإحداثيات ITM مع كتلة سهم شمال
pts = [(219876.512, 634512.248), (219901.007, 634509.113), (219917.402, 634521.776), (219914.058, 634540.881), (219890.733, 634546.402), (219872.115, 634531.067)]
doc = ezdxf.new("R2018"); common_layers(doc); doc.layers.add("PARCEL", color=7)
blk = doc.blocks.new("NORTH"); blk.add_lwpolyline([(0, 0), (1, 3), (2, 0)], close=True)
msp = doc.modelspace(); msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "PARCEL"})
msp.add_blockref("NORTH", (219930, 634550), dxfattribs={"layer": "TEXT"}); decorate(msp, pts)
save(doc, "hexagon_r2018.dxf", pts, "PARCEL")

# 4) حدود من خطوط منفصلة (LINE) R2010، ترتيب واتجاهات مختلطة
pts = [(170600.0, 181100.0), (170625.5, 181097.25), (170631.75, 181121.0), (170603.25, 181124.5)]
doc = ezdxf.new("R2010"); common_layers(doc); doc.layers.add("LOT", color=7)
msp = doc.modelspace()
for (a, b) in [(pts[2], pts[1]), (pts[0], pts[1]), (pts[3], pts[0]), (pts[2], pts[3])]:
    msp.add_line(a, b, dxfattribs={"layer": "LOT"})
decorate(msp, pts)
save(doc, "lines_r2010.dxf", pts, "LOT")

# 5) بوليلاين بنظام إحداثيات مقلوب (extrusion 0,0,-1) كما يحدث بعد MIRROR في أوتوكاد
pts = [(170700.0, 181200.0), (170720.0, 181200.0), (170720.0, 181215.0), (170700.0, 181215.0)]
doc = ezdxf.new("R2013"); doc.layers.add("MIRRORED", color=7)
msp = doc.modelspace()
ocs_pts = [(-x, y) for (x, y) in pts]   # في OCS المقلوب: x_world = -x_ocs
msp.add_lwpolyline(ocs_pts, close=True, dxfattribs={"layer": "MIRRORED", "extrusion": (0, 0, -1)})
save(doc, "mirrored_ocs.dxf", pts, "MIRRORED")

# 6) الحدود داخل كتلة مُدرجة بإزاحة ودوران 30°
base = [(0.0, 0.0), (24.0, 0.0), (24.0, 18.0), (0.0, 18.0)]
ins, rot = (170800.0, 181300.0), 30.0
c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
pts = [(ins[0] + x * c - y * s, ins[1] + x * s + y * c) for (x, y) in base]
doc = ezdxf.new("R2018"); doc.layers.add("BLK_LOT", color=7)
blk = doc.blocks.new("LOT_BLOCK"); blk.add_lwpolyline(base, close=True)
doc.modelspace().add_blockref("LOT_BLOCK", ins, dxfattribs={"layer": "BLK_LOT", "rotation": rot})
save(doc, "block_rotated.dxf", pts, "BLK_LOT", {"tolerance": 1e-9})

# 7) ضلع مقوّس (bulge) – قوس نصف دائري قطره 10 م على الضلع الشمالي
pts = [(170900.0, 181400.0), (170910.0, 181400.0), (170910.0, 181410.0), (170900.0, 181410.0)]
doc = ezdxf.new("R2018"); doc.layers.add("ARC_LOT", color=7)
lw = doc.modelspace().add_lwpolyline([(170900.0, 181400.0, 0, 0, 0), (170910.0, 181400.0, 0, 0, 0), (170910.0, 181410.0, 0, 0, 1.0), (170900.0, 181410.0, 0, 0, 0)], format="xyseb", close=True, dxfattribs={"layer": "ARC_LOT"})
doc.saveas(os.path.join(HERE, "bulge_arc.dxf"))
expected["bulge_arc.dxf"] = {"layer": "ARC_LOT", "area": 100 + math.pi * 25 / 2, "arc": True}

# 8) ملف قديم R2000 بترميز عربي ANSI_1256
pts = [(171000.5, 181500.25), (171018.75, 181500.25), (171018.75, 181512.5), (171000.5, 181512.5)]
doc = ezdxf.new("R2000"); doc.header["$DWGCODEPAGE"] = "ANSI_1256"; doc.encoding = "cp1256"
doc.layers.add("قطعة 15 حوض 3", color=7)
doc.modelspace().add_lwpolyline(pts, close=True, dxfattribs={"layer": "قطعة 15 حوض 3"})
save(doc, "arabic_ansi1256.dxf", pts, "قطعة 15 حوض 3")

with open(os.path.join(HERE, "expected.json"), "w", encoding="utf-8") as f:
    json.dump(expected, f, ensure_ascii=False, indent=1)
print("ok", len(expected))
