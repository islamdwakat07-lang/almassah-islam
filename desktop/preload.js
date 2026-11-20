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
