/**
 * تحويل الإحداثيات بين العالم (أمتار، Y للأعلى) والشاشة (بكسل، Y للأسفل).
 * المركز يُحفظ بالأرقام الحقيقية، والرسم يتم بإحداثيات شاشة صغيرة فلا تضيع الدقة.
 */
export class Viewport {
  cx = 0; cy = 0; s = 10; W = 800; H = 600;
  setSize(W: number, H: number) { this.W = W; this.H = H; }
  toScreen(x: number, y: number): [number, number] { return [(x - this.cx) * this.s + this.W / 2, (this.cy - y) * this.s + this.H / 2]; }
  toWorld(px: number, py: number): [number, number] { return [this.cx + (px - this.W / 2) / this.s, this.cy - (py - this.H / 2) / this.s]; }
  /** تكبير حول نقطة على الشاشة تبقى ثابتة تحت الإصبع/المؤشر */
  zoomAt(px: number, py: number, f: number) {
    const [wx, wy] = this.toWorld(px, py);
    this.s = Math.min(5000, Math.max(0.005, this.s * f));
    this.cx = wx - (px - this.W / 2) / this.s; this.cy = wy + (py - this.H / 2) / this.s;
  }
  panBy(dx: number, dy: number) { this.cx -= dx / this.s; this.cy += dy / this.s; }
  /** يملأ المساحة المتاحة بعد خصم الأشرطة التي تغطي الرسم (يمين: الأدوات، أسفل: لوحة الهاتف) */
  fit(b: { x0: number; y0: number; x1: number; y1: number }, pad = 60, insetBottom = 0, insetRight = 0) {
    if (!b || !Number.isFinite(b.x0)) return;
    const w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.y1 - b.y0, 1);
    const H = Math.max(80, this.H - insetBottom), W = Math.max(80, this.W - insetRight);
    this.s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    this.cx = (b.x0 + b.x1) / 2 + insetRight / 2 / this.s; this.cy = (b.y0 + b.y1) / 2 - insetBottom / 2 / this.s;
  }
  toJSON() { return { cx: this.cx, cy: this.cy, s: this.s }; }
}

/** خطوة شبكة «جميلة» (1، 2، 5 × 10ⁿ) بحيث تكون الخلايا قرابة 28 بكسل أو أكثر */
export function niceStep(s: number, minPx = 28) {
  const raw = minPx / s, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
