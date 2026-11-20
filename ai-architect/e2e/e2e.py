"""اختبار التطبيق الفعلي في المتصفح (بعد البناء): python3 e2e/e2e.py <مجلد البناء>"""
import subprocess, time, os, sys, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "app/src/main/assets/ai-architect")
OUT = os.path.join(ROOT, "e2e", "out"); os.makedirs(OUT, exist_ok=True)
FIX = os.path.join(ROOT, "tests", "fixtures")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8792"], cwd=BUILD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
results, errors = [], []
def check(c, name, detail=""):
    results.append(bool(c)); print(("✓ " if c else "✗ ") + name + (f"  [{detail}]" if detail else ""))
stat = lambda pg, sel=".stat b": pg.locator(sel).first.inner_text()

def click_edge(pg, i):
    box = pg.locator(f"[data-e='{i}']").bounding_box()
    pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.wait_for_timeout(150)

try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    for label, vp in [("desktop", {"width": 1440, "height": 900}), ("phone", {"width": 412, "height": 880})]:
        ctx = b.new_context(viewport=vp, accept_downloads=True); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"{label}: {e}"))
        pg.on("console", lambda m: m.type == "error" and "fonts.googleapis" not in m.text and "ERR_TUNNEL" not in m.text and errors.append(f"{label} console: {m.text}"))
        pg.goto("http://localhost:8792/index.html"); pg.wait_for_selector(".dash")
        # 1) رسم يدوي
        pg.click("[data-a=new] >> nth=0"); pg.fill("#nName", "رسم يدوي"); pg.click("button[type=submit]"); pg.wait_for_selector("#scene"); pg.wait_for_timeout(300)
        box = pg.locator("#scene").bounding_box(); cx, cy = box["x"] + box["width"] / 2 - 30, box["y"] + min(box["height"] / 2, 250)
        for dx, dy in [(-110, 70), (110, 70), (110, -60), (-110, -60)]: pg.mouse.click(cx + dx, cy + dy); pg.wait_for_timeout(60)
        check(pg.locator("#drawbar").inner_text().startswith("4"), f"{label}: رسم 4 رؤوس بالضغط")
        pg.click("[data-a=close]"); pg.wait_for_timeout(250)
        check(pg.locator(".steps .st.now").inner_text().endswith("الشارع"), f"{label}: بعد الإغلاق ينتقل لخطوة الشارع")
        # 2) إحداثيات دقيقة: مستطيل 30×20
        pg.click("[data-step=land]"); pg.wait_for_timeout(100)
        pg.click("#pbody [data-a=paste]"); pg.fill("#ptxt", "170000.125, 180000.250\n170030.125, 180000.250\n170030.125, 180020.250\n170000.125, 180020.250"); pg.click(".sheet button[type=submit]"); pg.wait_for_timeout(300)
        pg.click("[data-step=land]"); pg.wait_for_timeout(100)
        check(stat(pg) == "600.00", f"{label}: مستطيل 30×20 ملصوق = 600.00 م²", stat(pg))
        check(pg.locator("[data-vx='0']").input_value() == "170000.125", f"{label}: الإحداثي محفوظ بدقته")
        check("90°00′00″" in pg.locator("#pbody").inner_text(), f"{label}: الزوايا 90°")
        # 3) الشارع
        pg.click("[data-step=street]"); pg.wait_for_timeout(150); click_edge(pg, 0)
        types = [pg.locator(f"[data-etype='{i}']").input_value() for i in range(4)]
        check(types == ["front", "side", "back", "side"], f"{label}: شارع واحد ⇒ أمامي/جانبي/خلفي/جانبي", ",".join(types))
        # 4) الاشتراطات
        pg.click("[data-go=rules]"); pg.wait_for_timeout(100)
        pg.fill("[data-rule=back]", "4"); pg.press("[data-rule=back]", "Enter"); pg.fill("[data-rule=coverage]", "30"); pg.press("[data-rule=coverage]", "Enter"); pg.wait_for_timeout(100)
        pg.click("[data-go=result]"); pg.wait_for_timeout(200)
        z = pg.locator(".stat.zone b").inner_text(); hero = pg.locator(".stat.hero b").inner_text()
        check(z == "264.00" or z == "263.99", f"{label}: المنطقة الصالحة (30−6)×(20−4−5)… = 264", z)
        check(hero == "180.00", f"{label}: نسبة 30% ⇒ أقصى طابق 180.00 م²", hero)
        check("لا تجاوز" in pg.locator(".chip.big").inner_text(), f"{label}: شارة التحقق المستقل")
        check(len(pg.locator("ul.explain li").all()) >= 4, f"{label}: شرح مبسط للنتيجة")
        pg.screenshot(path=f"{OUT}/{label}-result.png")
        # 4ب) المرحلة 2: مساحة البناء والأشكال المقترحة
        pg.click("[data-go=building]"); pg.wait_for_timeout(150)
        pg.fill("[data-mass=target]", "150"); pg.press("[data-mass=target]", "Enter"); pg.wait_for_timeout(400)
        n_opts = pg.locator(".mass").count()
        check(n_opts >= 3, f"{label}: أشكال مبنى مقترحة لمساحة 150 م²", n_opts)
        check(pg.locator(".stat.hero b").inner_text() == "150.00", f"{label}: مساحة الطابق المختار 150.00", pg.locator(".stat.hero b").inner_text())
        check("24.00 × 6.25" in pg.locator(".mass").first.inner_text(), f"{label}: الخيار الأول يملأ العرض 24.00 × 6.25", pg.locator(".mass em").first.inner_text())
        check("لا يتجاوز" in pg.locator(".chip.big").inner_text(), f"{label}: شارة تحقق المبنى")
        pg.locator(".mass").nth(2).click(); pg.wait_for_timeout(250)
        check(pg.locator(".mass").nth(2).get_attribute("class").endswith("on"), f"{label}: اختيار شكل آخر")
        pg.screenshot(path=f"{OUT}/{label}-building.png")
        if label == "desktop":
            with pg.expect_download() as dl: pg.click("#pbody [data-a=export]")
            txt = open(dl.value.path(), encoding="utf-8").read()
            check("BUILDING" in txt, "desktop: طبقة المبنى في ملف DXF")
        pg.fill("[data-mass=target]", "400"); pg.press("[data-mass=target]", "Enter"); pg.wait_for_timeout(400)
        check("أكبر من المسموح" in pg.locator("#pbody").inner_text() and pg.locator(".stat.hero b").inner_text() == "180.00", f"{label}: 400 م² تُقص إلى 180 حسب نسبة البناء")
        pg.fill("[data-mass=target]", "150"); pg.press("[data-mass=target]", "Enter"); pg.wait_for_timeout(300)
        # 5) أرض زاوية
        pg.click("[data-step=street]"); pg.wait_for_timeout(150); click_edge(pg, 1)
        types = [pg.locator(f"[data-etype='{i}']").input_value() for i in range(4)]
        check(types == ["front", "front", "side", "side"], f"{label}: شارعان ⇒ لا يوجد خلفي", ",".join(types))
        pg.click("[data-step=result]"); pg.wait_for_timeout(150); z = pg.locator(".stat.zone b").inner_text()
        check(z in ("264.00", "263.99"), f"{label}: أرض زاوية (30−5−3)×(20−5−3) = 264", z)
        # 6) طريقة الزوايا (لا تؤثر على المستطيل)
        pg.click("[data-step=rules]"); pg.click("details.adv summary"); pg.click("input[name=join][value=round]"); pg.wait_for_timeout(150)
        pg.click("[data-step=result]"); check(pg.locator(".stat.zone b").inner_text() in ("264.00", "263.99"), f"{label}: Round لا يغير مستطيلاً بزوايا قائمة")
        # 7) تراجع
        pg.click("[data-a=undo]"); pg.wait_for_timeout(100); pg.click("[data-step=rules]")
        check(pg.locator("input[name=join][value=miter]").is_checked(), f"{label}: التراجع يعيد Miter")
        # 8) التصدير
        if label == "desktop":
            with pg.expect_download() as dl: pg.click(".topbar [data-a=export]")
            txt = open(dl.value.path(), encoding="utf-8").read(); open(f"{OUT}/export.dxf", "w").write(txt)
            check("170000.125" in txt and "180020.25" in txt and "BUILDABLE_ZONE" in txt, "desktop: ملف DXF بالإحداثيات الكاملة والطبقات")
        # 9) الحفظ التلقائي
        pg.wait_for_timeout(700); pg.reload(); pg.wait_for_selector("#scene"); pg.wait_for_timeout(300); pg.click("[data-step=land]")
        check(stat(pg) == "600.00", f"{label}: الحفظ التلقائي بعد إعادة التحميل")
        # 10) استيراد DXF حقيقي بطبقات متعددة
        pg.goto("http://localhost:8792/index.html#projects"); pg.wait_for_selector(".dash")
        pg.click("[data-a=new] >> nth=0"); pg.fill("#nName", "خماسي DXF"); pg.click("button[type=submit]"); pg.wait_for_selector("#scene")
        pg.set_input_files("#dxfIn", os.path.join(FIX, "pentagon_r2000.dxf")); pg.wait_for_timeout(400)
        has_pick = pg.locator(".sheet .pick label").count()
        check(has_pick >= 2 and "حدود القطعة" in pg.locator(".sheet").inner_text(), f"{label}: نافذة اختيار الطبقة عند وجود أكثر من شكل", has_pick)
        pg.click(".sheet button[type=submit]"); pg.wait_for_timeout(300)
        pg.click("[data-step=land]"); pg.wait_for_timeout(100)
        check(pg.locator("[data-vx='0']").input_value() == "170500.1234" and pg.locator("[data-vy='0']").input_value() == "181000.5678", f"{label}: إحداثيات DXF مطابقة تماماً")
        pg.click("[data-step=street]"); pg.wait_for_timeout(100); click_edge(pg, 0); pg.click("[data-step=result]"); pg.wait_for_timeout(150)
        check("لا تجاوز" in pg.locator(".chip.big").inner_text(), f"{label}: أرض DXF غير منتظمة ✓ تحقق")
        pg.click("[data-a=angles]"); pg.wait_for_timeout(100); pg.screenshot(path=f"{OUT}/{label}-dxf-result.png")
        pg.click("[data-step=rules]"); pg.wait_for_timeout(100); pg.screenshot(path=f"{OUT}/{label}-rules.png")
        # 11) لوحة المشاريع
        pg.click("[data-a=home]"); pg.wait_for_selector(".pcard"); pg.wait_for_timeout(300)
        check(pg.locator(".pcard").count() == 2, f"{label}: لوحة المشاريع", pg.locator(".pcard").count())
        pg.screenshot(path=f"{OUT}/{label}-dashboard.png", full_page=True)
        check(pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{label}: بدون تمرير أفقي")
        ctx.close()
    b.close()
finally:
    srv.kill()
for e in errors: print("ERR", e)
bad = results.count(False)
print(f"\nنجح {results.count(True)} · فشل {bad} · أخطاء الصفحة {len(errors)}")
sys.exit(1 if bad or errors else 0)
