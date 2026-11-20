/**
 * الفروق بين الأماكن التي يعمل فيها التطبيق (طبقة واحدة معزولة):
 *  • داخل تطبيق المهندس إسلام (أندرويد): AndroidBridge.saveFile / paste
 *  • صفحة منشورة على claude.ai: قدرة downloads (لا تقبل امتداد dxf فيُضغط الملف في ZIP)
 *  • متصفح عادي على الكمبيوتر: تنزيل مباشر
 */
declare global { interface Window { AndroidBridge?: any; claude?: any } }

export const inAndroid = () => typeof window !== "undefined" && !!(window.AndroidBridge && window.AndroidBridge.saveFile);
export const caps: { downloads: any } = { downloads: null };

export async function saveBytes(name: string, bytes: Uint8Array, mime: string, zipped: () => { name: string; data: Uint8Array }): Promise<string> {
  if (inAndroid()) {
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    window.AndroidBridge.saveFile(name, btoa(bin), mime);
    return `حُفظ الملف «${name}» في التنزيلات`;
  }
  if (caps.downloads) {
    const z = zipped();
    await caps.downloads.save({ filename: z.name, data: new Blob([z.data], { type: "application/zip" }) });
    return "حُفظ الملف (DXF داخل ZIP). فك الضغط وافتحه في أوتوكاد.";
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return `نُزّل الملف «${name}»`;
}

export async function readClipboard(): Promise<string> {
  try { if (window.AndroidBridge && window.AndroidBridge.paste) { const t = window.AndroidBridge.paste(); if (t) return t; } } catch (e) { /* */ }
  try { return await navigator.clipboard.readText(); } catch (e) { return ""; }
}
