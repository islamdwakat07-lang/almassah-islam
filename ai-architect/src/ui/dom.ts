/* أدوات واجهة صغيرة: تنسيق، رسائل، لوح منبثق، أيقونات */
export const $ = (s: string, r: ParentNode = document): any => r.querySelector(s);
export const $$ = (s: string, r: ParentNode = document): any[] => Array.from(r.querySelectorAll(s));
export const esc = (s: any): string => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const fmt = (v: number, d = 2) => Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
export const fmtCoord = (v: number) => Number.isFinite(v) ? v.toFixed(3) : "—";
export function fmtDMS(deg: number) {
  if (!Number.isFinite(deg)) return "—";
  let d = Math.floor(deg), mF = (deg - d) * 60, m = Math.floor(mF), s = Math.round((mF - m) * 60);
  if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d++; }
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}
/** قراءة رقم من حقل (يقبل الأرقام العربية والفاصلة العربية) */
export function readNum(s: any) {
  const t = String(s == null ? "" : s).trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/٫/g, ".").replace(/,/g, ".");
  if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) return NaN;
  return parseFloat(t);
}
export function timeAgo(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "الآن"; if (s < 3600) return `قبل ${Math.round(s / 60)} د`; if (s < 86400) return `قبل ${Math.round(s / 3600)} س`;
  return new Date(t).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "short", day: "numeric" });
}

let toastT: any;
export function toast(msg: string, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

/** لوح منبثق داخل الصفحة (بدل confirm/prompt) */
export function sheet(html: string, onAction?: (act: string, w: any, b?: any) => any) {
  const w = $("#sheet"); w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; w.hidden = false;
  const close = () => { w.hidden = true; w.innerHTML = ""; document.removeEventListener("keydown", key); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", key);
  w.onclick = (e: any) => {
    if (e.target === w) { close(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const r = onAction ? onAction(b.dataset.act, w, b) : undefined;
    if (r !== false) close();
  };
  w.onsubmit = (e: any) => { e.preventDefault(); const r = onAction ? onAction("submit", w) : undefined; if (r !== false) close(); };
  setTimeout(() => { const f = w.querySelector("[autofocus]") || w.querySelector("input,textarea,button"); f && f.focus(); }, 30);
  return { close, el: w };
}

const I = (p: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const icon = {
  select: I('<path d="M5 3.5l13 7.2-5.6 1.5L15.8 19l-2.6 1.3-3.3-6.7L5 17.7z"/>'),
  draw: I('<path d="M4 19l5-13 6 8 5-9"/><circle cx="4" cy="19" r="1.6" fill="currentColor"/><circle cx="9" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="14" r="1.6" fill="currentColor"/><circle cx="20" cy="5" r="1.6" fill="currentColor"/>'),
  pan: I('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  zoomIn: I('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M11 8v6M8 11h6"/>'),
  zoomOut: I('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8 11h6"/>'),
  fit: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
  undo: I('<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>'),
  redo: I('<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12"/>'),
  back: I('<path d="M9 6l6 6-6 6"/>'),
  dots: I('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
  upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  download: I('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  paste: I('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  close: I('<path d="M12 3l9 16H3z"/>'),
  angle: I('<path d="M4 20h16M4 20L16 6"/><path d="M10 20a6 6 0 0 0-2-4.5"/>')
};
