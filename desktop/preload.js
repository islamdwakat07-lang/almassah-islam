/* بديل AndroidBridge على الويندوز: نفس أسماء الدوال التي تستعملها صفحات التطبيق */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("AndroidBridge", {
  saveFile: (name, b64, mime) => { ipcRenderer.invoke("saveFile", String(name), String(b64), String(mime || "")); },
  saveBegin: (name, mime) => ipcRenderer.sendSync("saveBegin", String(name), String(mime || "")),
  saveChunk: b64 => ipcRenderer.sendSync("saveChunk", String(b64)),
  saveEnd: () => ipcRenderer.sendSync("saveEnd"),
  copy: t => ipcRenderer.send("copy", String(t ?? "")),
  paste: () => ipcRenderer.sendSync("paste"),
  appVersion: () => ipcRenderer.sendSync("appVersion"),
  httpGet: (id, url, asB64) => ipcRenderer.send("http", String(id), "GET", String(url), null, null, !!asB64),
  httpPost: (id, url, headersJson, body) => { let h = {}; try { h = JSON.parse(headersJson || "{}"); } catch (e) {} ipcRenderer.send("http", String(id), "POST", String(url), h, String(body ?? ""), false); },
  openUrl: u => ipcRenderer.send("openUrl", String(u)),
  openMap: (url, external) => ipcRenderer.send("openMap", String(url), !!external),
  shareFile: (b64, name, mime) => { ipcRenderer.invoke("shareFile", String(b64), String(name), String(mime || "")); },
  close: () => ipcRenderer.send("close"),
  jsReady: () => {},
  isDesktop: true
});

/* زر «رجوع» للصفحة السابقة داخل كل أداة (على الهاتف يوجد زر الرجوع في الجهاز، أما على الكمبيوتر فلا) */
function addBack() {
  const p = location.pathname;
  if (/\/home\.html$/.test(p) || p === "/" || document.getElementById("pc-back")) return;
  const go = () => { if (history.length > 1) history.back(); else location.href = "app://local/home.html"; };
  const home = document.querySelector(".am-bar .am-home");
  const b = document.createElement("a");
  b.id = "pc-back"; b.href = "#"; b.title = "رجوع للصفحة السابقة (Alt + ←)";
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 5l7 7-7 7-1.4-1.4L13.2 12 7.6 6.4z"/></svg>رجوع';
  b.addEventListener("click", e => { e.preventDefault(); go(); });
  if (home) {
    b.className = "am-home"; home.parentNode.insertBefore(b, home);
    home.style.marginInlineStart = "6px";
  } else {
    b.style.cssText = "position:fixed;z-index:99999;top:10px;left:10px;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;background:linear-gradient(180deg,#fff1b8,#e6c35f);color:#0c3b26;font:700 14px 'IBM Plex Sans Arabic',Tahoma,sans-serif;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,.3)";
    document.body.appendChild(b);
  }
  const svg = b.querySelector("svg"); svg.style.width = "18px"; svg.style.height = "18px";
}
window.addEventListener("DOMContentLoaded", () => { addBack(); setTimeout(addBack, 600); });
