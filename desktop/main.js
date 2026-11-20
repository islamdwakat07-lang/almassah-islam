/* المهندس إسلام – نسخة ويندوز (Electron)
   نفس صفحات تطبيق الأندرويد تماماً، مع جسر AndroidBridge بديل: حفظ الملفات بنافذة «حفظ باسم»،
   والاتصال بالمواقع (جيومولج، الإدارة المدنية…) من البرنامج نفسه بدون قيود المتصفح. */
"use strict";
const { app, BrowserWindow, protocol, net, ipcMain, dialog, clipboard, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const ASSETS = app.isPackaged ? path.join(process.resourcesPath, "assets") : path.join(__dirname, "..", "app", "src", "main", "assets");
const HOST = "app://local/";

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let win = null;
const lastDir = { p: app.getPath("downloads") };

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 560, show: false, backgroundColor: "#0c3b26",
    title: "المهندس إسلام", icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, webSecurity: false, spellcheck: false }
  });
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  win.loadURL(HOST + "home.html");
  // روابط المواقع الخارجية تفتح في متصفح الويندوز (مثل الأندرويد)
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(HOST)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(HOST)) return { action: "allow" };
    if (/^https:\/\/(www\.)?govmap\.gov\.il/.test(url)) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1280, height: 860 } };
    shell.openExternal(url); return { action: "deny" };
  });
  // F5 تحديث، F12 أدوات المطوّر، Alt+← رجوع
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (i.key === "F5") win.webContents.reload();
    else if (i.key === "F12") win.webContents.toggleDevTools();
    else if (i.alt && i.key === "ArrowLeft" && win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle("app", req => {
    let p = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "");
    if (!p) p = "home.html";
    const file = path.normalize(path.join(ASSETS, p));
    if (!file.startsWith(ASSETS)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on("window-all-closed", () => app.quit());

/* ---------- الجسر ---------- */
const send = (code) => { if (win && !win.isDestroyed()) win.webContents.executeJavaScript(code).catch(() => {}); };
const q = s => JSON.stringify(String(s ?? ""));
const MIME_EXT = { "application/pdf": ["PDF", ["pdf"]], "application/dxf": ["DXF", ["dxf"]], "image/png": ["PNG", ["png"]], "image/jpeg": ["JPEG", ["jpg", "jpeg"]], "application/zip": ["ZIP", ["zip"]], "text/csv": ["CSV", ["csv"]] };
async function askSave(name, mime) {
  const ext = (path.extname(name).slice(1) || "").toLowerCase(), m = MIME_EXT[mime];
  const filters = m ? [{ name: m[0], extensions: m[1] }] : ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [];
  const r = await dialog.showSaveDialog(win, { title: "حفظ الملف", defaultPath: path.join(lastDir.p, String(name).replace(/[\\/:*?"<>|]/g, "-")), filters: filters.concat([{ name: "كل الملفات", extensions: ["*"] }]) });
  if (r.canceled || !r.filePath) return null;
  lastDir.p = path.dirname(r.filePath); return r.filePath;
}
const toast = msg => send(`(function(){var t=document.createElement("div");t.textContent=${q(msg)};t.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#0c3b26;color:#fff6d6;border:2px solid #c99a2e;border-radius:999px;padding:10px 18px;font:600 15px 'IBM Plex Sans Arabic',Tahoma,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.35)";document.body.appendChild(t);setTimeout(function(){t.remove()},3500)})()`);

ipcMain.handle("saveFile", async (_e, name, b64, mime) => {
  const f = await askSave(name, mime); if (!f) return false;
  fs.writeFileSync(f, Buffer.from(b64, "base64")); toast("حُفظ الملف: " + path.basename(f)); return true;
});
let bk = null;
ipcMain.on("saveBegin", async (e, name, mime) => { const f = await askSave(name, mime); if (!f) { e.returnValue = false; return; } try { bk = { fd: fs.openSync(f, "w"), f }; e.returnValue = true; } catch (er) { e.returnValue = false; } });
ipcMain.on("saveChunk", (e, b64) => { try { fs.writeSync(bk.fd, Buffer.from(b64, "base64")); e.returnValue = true; } catch (er) { e.returnValue = false; } });
ipcMain.on("saveEnd", (e) => { try { fs.closeSync(bk.fd); toast("حُفظت النسخة: " + path.basename(bk.f)); } catch (er) {} bk = null; e.returnValue = true; });
ipcMain.on("copy", (_e, t) => clipboard.writeText(String(t ?? "")));
ipcMain.on("paste", e => { e.returnValue = clipboard.readText() || ""; });
ipcMain.on("appVersion", e => { e.returnValue = app.getVersion(); });
ipcMain.on("openUrl", (_e, u) => { if (/^https?:|^mailto:|^tel:/.test(u)) shell.openExternal(u); });
ipcMain.on("openMap", (_e, url, external) => {
  if (external || !/^https:\/\/(www\.)?govmap\.gov\.il/.test(url)) { shell.openExternal(url.replace(/#almassah-print$/, "")); return; }
  const w = new BrowserWindow({ width: 1280, height: 860, autoHideMenuBar: true, title: "GovMap" }); w.loadURL(url.replace(/#almassah-print$/, ""));
});
ipcMain.on("close", () => { if (win && win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack(); else win && win.loadURL(HOST + "home.html"); });
ipcMain.on("http", async (_e, id, method, url, headers, body, asB64) => {
  let code = -1, text = "";
  try {
    if (!/^https:\/\//.test(url)) throw new Error("https only");
    const r = await net.fetch(url, { method, headers: headers || {}, body: method === "POST" ? body : undefined });
    code = r.status;
    if (asB64 && code < 400) text = Buffer.from(await r.arrayBuffer()).toString("base64"); else text = await r.text();
  } catch (er) { code = -1; text = String(er && er.message || er); }
  send(`window.onNativeHttp && window.onNativeHttp(${q(id)},${code},${q(text)})`);
});
ipcMain.handle("shareFile", async (_e, b64, name, mime) => {   // لا توجد «مشاركة» على الويندوز: نحفظ الملف
  const f = await askSave(name, mime); if (!f) return false; fs.writeFileSync(f, Buffer.from(b64, "base64")); shell.showItemInFolder(f); return true;
});
