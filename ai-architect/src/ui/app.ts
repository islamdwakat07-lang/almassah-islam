/* نقطة البداية: الخطوط، التخزين، التنقل بين المشاريع ومساحة العمل */
import "./styles.css";
import { Store, CloudRepo, makeLocalRepo } from "../data/store";
import { caps, inAndroid } from "../io/platform";
import { openDashboard } from "./dashboard";
import { openWorkspace } from "./workspace";
import { toast } from "./dom";

// الخطوط: داخل تطبيق المهندس إسلام نستخدم الخطوط المحلية (بدون إنترنت)، وفي المتصفح خطوط Google
const inApp = location.host === "appassets.androidplatform.net" || inAndroid();
const link = document.createElement("link"); link.rel = "stylesheet";
link.href = inApp ? "../ifraz/fonts.css" : "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@500;600;700&display=swap";
document.head.appendChild(link);
document.documentElement.classList.toggle("in-app", inApp);

const root = document.getElementById("app") as HTMLElement;
const store = new Store(makeLocalRepo());
let cleanup: any = null, routeN = 0;
function go(name: string) { if (location.hash !== "#" + name) location.hash = name; else route(); }
const ctx = { store, go, inApp };

async function route() {
  const n = ++routeN, h = location.hash.replace(/^#/, "");
  if (cleanup) { try { cleanup(); } catch (e) { /* */ } cleanup = null; }
  if (h.startsWith("p-")) {
    const p = await store.get(h.slice(2)); if (n !== routeN) return;
    if (!p) { toast("لم أجد هذا المشروع"); go("projects"); return; }
    cleanup = openWorkspace(root, p, ctx);
  } else cleanup = await openDashboard(root, ctx);
}
addEventListener("hashchange", route);
addEventListener("pagehide", () => { store.flush(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") store.flush(); });
route();

// عند النشر على claude.ai: حفظ في حساب المستخدم + حفظ الملفات
(async () => {
  const w: any = window; const use = w.claude && typeof w.claude.use === "function" ? w.claude.use.bind(w.claude) : null;
  if (!use) return;
  try { caps.downloads = await use("downloads"); } catch (e) { /* */ }
  try {
    const [db, user] = await Promise.all([use("db"), use("user")]); if (!db || !user) return;
    const uid = await user.id(); if (!uid) return;
    const cloud = new CloudRepo(db, uid); await cloud.list(); await store.adopt(cloud);
  } catch (e) { console.warn("cloud storage unavailable", e); }
})();
