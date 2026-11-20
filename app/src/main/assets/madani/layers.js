/* طبقات «الإدارة المدنية – معلومات للجمهور» (ArcGIS Online، عامة) — فحص الأرض · المهندس إسلام
   البيانات مخزنة على الخادم بنظام Web Mercator (3857). كل التحويلات تتم هنا بنفس تعريفات proj4 المستعملة في GEO إسلام. */
"use strict";
const SVC = "https://services7.arcgis.com/LNelXmPD58p66zmN/arcgis/rest/services/";
const WEBMAP = "https://mnz.maps.arcgis.com/sharing/rest/content/items/073b5a69149f444489fd1ba172dbd84f/data?f=json";
const W = "מפת_חופש_המידע_מעודכנת_24_7_24_WFL1";

/* kind: parcel = قطع الأراضي · block = الأحواض · village = أراضي القرى · zone = تصنيف أوسلو
         restrict = قيد يُهشَّر على المخطط · plan = مخطط · info = معلومة · point = نقاط */
const LAYERS = [
  { k: "abc",     n: "تصنيف أوسلو",                     u: "ABCarea/FeatureServer/0", kind: "zone", c: "#e11d48" },
  { k: "state",   n: "أراضي دولة وملكيات",               u: "בעלויות_קרקע_-_חופש_המידע/FeatureServer/0", kind: "restrict", c: "#16a34a", h: 45 },
  { k: "expro",   n: "أوامر استملاك",                    u: "צווי_הפקעה_חופש_המידע/FeatureServer/0", kind: "restrict", c: "#7c3aed", h: -45 },
  { k: "milban",  n: "أوامر حظر بناء عسكرية",             u: "צווי_איסור_בנייה_חופש_מידע/FeatureServer/0", kind: "restrict", c: "#dc2626", h: 0 },
  { k: "ban196",  n: "حظر البناء 1/96 (حول الطرق)",       u: "איסור_בניה_1_96_מידע_לציבור_/FeatureServer/51", kind: "restrict", c: "#ea580c", h: 90 },
  { k: "fire",    n: "مناطق إطلاق نار / تدريب عسكري",     u: "שטחי_אש_חופש_המידע/FeatureServer/0", kind: "restrict", c: "#b91c1c", h: 30 },
  { k: "natord",  n: "أوامر محميات طبيعية",               u: W + "/FeatureServer/38", kind: "restrict", c: "#0891b2", h: 60 },
  { k: "manres",  n: "محميات من عهد الانتداب",            u: "שמורות_מנדטוריות_חופש_המידע/FeatureServer/0", kind: "restrict", c: "#0e7490", h: -60 },
  { k: "forest",  n: "غابات",                             u: W + "/FeatureServer/27", kind: "restrict", c: "#15803d", h: 120 },
  { k: "forest2", n: "غابات إلزامية (انتداب)",            u: W + "/FeatureServer/15", kind: "restrict", c: "#166534", h: -30 },
  { k: "archp",   n: "مواقع أثرية معلنة (مضلعات)",        u: "פוליגונים_ארכאולוגיים_מוכרזים_צפייה/FeatureServer/0", kind: "restrict", c: "#a16207", h: 15 },
  { k: "olive",   n: "إغلاق موسم قطف الزيتون",            u: "מסיק_זיתים_2026_חופש_מידע_/FeatureServer/0", kind: "restrict", c: "#65a30d", h: 75 },
  { k: "road",    n: "مخططات طرق",                        u: "אתר_חופש_המידע_עדכון_שכבות/FeatureServer/75", kind: "plan", c: "#f59e0b", h: -15 },
  { k: "planp",   n: "مخططات القرى الفلسطينية",           u: "תכניות_ישובים_במגזר_הפלסטיניי_חופש_המידע/FeatureServer/0", kind: "plan", c: "#2563eb" },
  { k: "plani",   n: "مخططات المستوطنات",                 u: "תכניות_ישובים_במגזר_הישראלי_חופש_המידע/FeatureServer/0", kind: "restrict", c: "#9333ea", h: -75 },
  { k: "quarry",  n: "مخططات تعدين ومحاجر",               u: W + "/FeatureServer/32", kind: "restrict", c: "#78350f", h: 105 },
  { k: "indus",   n: "مناطق صناعية إسرائيلية",            u: W + "/FeatureServer/33", kind: "restrict", c: "#475569", h: 135 },
  { k: "dump",    n: "مكبات نفايات",                      u: W + "/FeatureServer/34", kind: "restrict", c: "#57534e", h: 165 },
  { k: "drain",   n: "أحواض صرف (مخطط قطري 62)",          u: "אגני_ניקוז_תמא_62_-_חופש_המידע/FeatureServer/53", kind: "info", c: "#0284c7" },
  { k: "council", n: "مناطق المجالس الإقليمية",           u: "תחומי_מועצות_אזוריות_חופש_המידע_ע/FeatureServer/0", kind: "info", c: "#6d28d9" },
  { k: "juris",   n: "أوامر مناطق نفوذ المستوطنات",       u: "צוי_בדבר_תחום_שיפוט_ישוב__חופש_המידע/FeatureServer/0", kind: "restrict", c: "#be185d", h: 10 },
  { k: "palj",    n: "مناطق نفوذ فلسطينية",               u: W + "/FeatureServer/9", kind: "info", c: "#0d9488" },
  { k: "fiscal",  n: "كتل مالية وأراضي وقف",              u: "גושים_פיסקאליים_ומווקעות_חופש_המידע/FeatureServer/0", kind: "info", c: "#b45309" },
  { k: "village", n: "حدود أراضي القرية",                 u: W + "/FeatureServer/18", kind: "village", c: "#facc15" },
  { k: "block",   n: "الأحواض",                           u: "גושים_חופש_המידע/FeatureServer/0", kind: "block", c: "#38bdf8" },
  { k: "parcel",  n: "قطع الأراضي",                       u: W + "/FeatureServer/17", kind: "parcel", c: "#ffffff" },
  { k: "archpt",  n: "مواقع أثرية (نقاط)",                u: W + "/FeatureServer/21", kind: "point", c: "#a16207" },
  { k: "namesP",  n: "أسماء القرى الفلسطينية",            u: "שמות_ישובים_ישראלים_וכפרים_פלסטינים/FeatureServer/1", kind: "point", c: "#0f766e" },
  { k: "namesI",  n: "أسماء المستوطنات",                  u: "שמות_ישובים_ישראלים_וכפרים_פלסטינים/FeatureServer/0", kind: "point", c: "#7e22ce" }
];
LAYERS.forEach(l => { l.url = SVC + l.u; });
const LBY = Object.fromEntries(LAYERS.map(l => [l.k, l]));

/* ترجمة القيم المرمّزة الأهم */
const ABC = { 6: "منطقة A", 7: "منطقة B", 9: "محمية طبيعية متفق عليها (B)", 10: "H1 (الخليل)", 11: "H2 (الخليل)", 0: "غير معروف" };
const STATE = {
  1: "أراضي دولة معلنة قبل 1998", 2: "أراضي دولة معلنة بعد 1998", 3: "أراضي دولة – خط أزرق قبل 2004", 4: "أراضي دولة – خط أزرق بعد 2004",
  5: "أراضي دولة مسجلة (طابو)", 6: "أراضي دولة مسجلة – مشاع", 7: "أراضي دولة – جدول حقوق غير نهائي", 8: "أراضي يهود قبل 1948",
  9: "أراضي يهود – طاقم الخط الأزرق", 10: "أراضٍ مشتراة إسرائيلية", 11: "وقف", 12: "كنيسة", 13: "قطع بإدارة المسؤول عن الأملاك الحكومية"
};
const COUNCIL = { 100: "شومرون", 200: "بنيامين", 300: "غور الأردن", 400: "غوش عتصيون", 500: "جبل الخليل", 600: "مجيلوت", 700: "القدس" };
const HEB = [   // كلمات عبرية شائعة في القيم → عربي (الباقي يظهر كما هو)
  ["אתר ארכאולוגי", "موقع أثري"], ["אתר ארכיאולוגי", "موقع أثري"], ["בעדיפות", "بأولوية"], ["יער מנדטורי רשום", "غابة انتدابية مسجلة"], ["יערות", "غابات"], ["יער", "غابة"],
  ["גנים לאומיים", "حدائق وطنية"], ["אתרים לאומיים", "مواقع وطنية"], ["אתרים היסטורים", "مواقع تاريخية"], ["אתרים אדריכלים", "مواقع معمارية"], ["שמורה", "محمية"], ["שמורת טבע", "محمية طبيعية"],
  ["איסור כניסה לישראלים", "منع دخول الإسرائيليين"], ["פוליגון בתיאום", "منطقة بالتنسيق"], ["שטח אימונים", "منطقة تدريب"], ["חפיפה בין", "تداخل بين"], ["ואתר ארכאולוגיה", "وموقع أثري"]
];
const heb = s => { s = String(s ?? ""); for (const [h, a] of HEB) s = s.split(h).join(a); return s; };

const FIELD_AR = {
  GUSH_NO: "رقم الحوض (الإدارة المدنية)", GUSHH_OLD: "رقم الحوض الأصلي", GUSH: "رقم الحوض", PARCEL: "رقم القطعة", PARCEL_NAME: "البلدة", PARCELATZIA: "الإفراز",
  M_M_NUMBER: "رقم المخطط المساحي (م.م)", BLOCK_NAME: "البلدة", LAND: "أراضي قرية", p_name: "اسم المخطط", p_number: "رقم المخطط", p_num: "رقم المخطط", P_NUM: "رقم المخطط",
  P_NAME: "الاسم", REG_AREA: "المساحة المسجلة (دونم)", O_STATUS_D: "تاريخ الإعلان", "מס_הצו": "رقم الأمر", "סיום_תוקף": "انتهاء السريان", "שם_צו": "اسم الأمر",
  "מספר_פוליגון": "رقم المضلع", "שנה": "السنة", MainType: "النوع", FIRE_NAME: "رقم المنطقة", TITLE: "الاسم", RES_NAME: "اسم المنطقة", TYPE: "النوع", TYPE_1: "نوع المنطقة",
  DESCRIPTIO: "الوصف", MAP_NO: "رقم الخارطة", REMARK: "الوصف", NAME: "الاسم", SEET: "البلدة", name_name: "المستوطنة", name_muni: "المجلس", stamped_da: "تاريخ الختم",
  MUNICIPAL_DISTR: "المجلس الإقليمي", type: "النوع", village: "البلدة / المخطط", gush_no: "رقم الحوض", parcel: "رقم القطعة", NAFOT_NAME: "اللواء", BLOCK_NUMBER: "رقم الكتلة",
  SETEL_NAME: "البلدة", MAUKOT_HEB: "الوقف / الكتلة", arab_name: "الاسم", settl_name_ar: "الاسم", SETTL_NAME_AR: "الاسم", p_tokef_di: "تاريخ السريان", p_tokef_pi: "تاريخ نشر السريان",
  p_afkada_p: "تاريخ نشر الإيداع", p_confirm_d: "تاريخ المصادقة", p_landuse_des: "استعمال الأرض", EZOR: "المنطقة"
};
const SKIP = /^(OBJECTID|FID|Shape__|SHAPE|GlobalID|CreationDate|Creator|EditDate|Editor|created_|last_edited|CREATED_|LAST_EDITED|MINHAL_|PERIMETER|OS_LO|X|Y|POINT_X|POINT_Y|שם_הי|SETTL_NAME|rp_)/i;
const isDate = (k, v) => typeof v === "number" && Math.abs(v) > 1e11 && v < 4e12 && /(_d|_da|_di|_p|_pi|date|תוקף|_D)$/i.test(k);
const fmtDate = v => { const d = new Date(v); return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0"); };

/* قيمة مقروءة لحقل */
function val(layer, k, v, meta) {
  if (v == null || v === "" || v === " ") return null;
  if (/^(gush_no|parcel|GUSH_NO|PARCEL)$/.test(k) && v === 0) return null;   // صفر = غير محدد
  if (layer.k === "abc" && k === "EZOR") return ABC[v] || String(v);
  if (layer.k === "state" && k === "type") return STATE[v] || String(v);
  if (layer.k === "council" && k === "MUNICIPAL_DISTR") return COUNCIL[v] || String(v);
  if (isDate(k, v)) return fmtDate(v);
  const f = meta && meta.fields && meta.fields.find(x => x.name === k);
  if (f && f.domain && f.domain.codedValues) { const c = f.domain.codedValues.find(c => c.code == v); if (c) return heb(c.name); }
  return heb(v);
}
/* سطور التفاصيل لعنصر */
function details(layer, a, meta) {
  const out = [];
  for (const [k, v] of Object.entries(a || {})) { if (SKIP.test(k)) continue; const s = val(layer, k, v, meta); if (s == null) continue; out.push([FIELD_AR[k] || k, s]); }
  return out;
}
/* عنوان قصير لعنصر */
function title(layer, a, meta) { const t = title0(layer, a || {}, meta); return t == null || t === "" ? layer.n : String(t); }
function title0(layer, a, meta) {
  switch (layer.k) {
    case "abc": return ABC[a.EZOR] || "—";
    case "state": return STATE[a.type] || "أراضي دولة";
    case "parcel": return `حوض ${a.GUSH_NO ?? "?"} · قطعة ${a.PARCEL ?? "?"}`;
    case "block": return `حوض ${a.GUSH_NO}` + (a.GUSHH_OLD ? ` (الأصلي ${String(a.GUSHH_OLD).trim()})` : "") + (a.BLOCK_NAME ? " · " + a.BLOCK_NAME : "");
    case "village": return a.LAND || "—";
    case "council": return COUNCIL[a.MUNICIPAL_DISTR] || "مجلس إقليمي";
    case "palj": return a.SEET == null ? "—" : (typeof a.SEET === "number" ? "منطقة نفوذ رقم " + a.SEET : String(a.SEET));
    case "juris": return a.name_name || "—";
    case "fire": return a.TITLE ? heb(a.TITLE) : "منطقة " + (a.FIRE_NAME || "");
    case "olive": return heb(a["שם_צו"] || a.MainType || "أمر إغلاق");
    case "milban": case "ban196": return "أمر " + (a["מס_הצו"] || "");
    case "namesP": return a.arab_name || a.settl_name_ar || a["שם_הי"] || "";
    case "namesI": return a.SETTL_NAME_AR || a.SETTL_NAME || "";
    case "fiscal": return [a.MAUKOT_HEB, a.SETEL_NAME, a.BLOCK_NUMBER != null ? "كتلة " + a.BLOCK_NUMBER : ""].filter(Boolean).join(" · ");
  }
  const d = details(layer, a, meta);
  const pick = d.find(r => /اسم|الاسم/.test(r[0])) || d.find(r => /رقم/.test(r[0])) || d[0];
  const num = d.find(r => /رقم المخطط|رقم الأمر/.test(r[0]));
  return pick ? (num && num !== pick ? pick[1] + " (" + num[1] + ")" : pick[1]) : layer.n;
}
