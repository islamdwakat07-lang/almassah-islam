package ps.islam.hisas;

/** Finds where one map picture lies inside another (scale + position), for exact print coordinates.
 *  Pure Java so it can be tested off the phone. Pictures are grey levels, box-averaged by a factor f. */
final class Reg {
    static final class Img { final int w, h; final float[] g; Img(int w, int h, float[] g) { this.w = w; this.h = h; this.g = g; } }

    /** grey picture, averaged over f×f blocks */
    static Img img(int[] px, int W, int H, int f) {
        int w = W / f, h = H / f; float[] g = new float[w * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            float s = 0;
            for (int yy = 0; yy < f; yy++) { int row = (y * f + yy) * W + x * f;
                for (int xx = 0; xx < f; xx++) { int p = px[row + xx]; s += ((p >> 16) & 255) * .3f + ((p >> 8) & 255) * .59f + (p & 255) * .11f; } }
            g[y * w + x] = s / (f * f);
        }
        return new Img(w, h, g);
    }

    static float samp(Img im, double x, double y) {
        if (x < 0 || y < 0 || x > im.w - 1.001 || y > im.h - 1.001) return Float.NaN;
        int x0 = (int) x, y0 = (int) y; double fx = x - x0, fy = y - y0; int i = y0 * im.w + x0;
        return (float) ((im.g[i] * (1 - fx) + im.g[i + 1] * fx) * (1 - fy) + (im.g[i + im.w] * (1 - fx) + im.g[i + im.w + 1] * fx) * fy);
    }

    /** normalised correlation of a (pixel p) against r (pixel s·p + t); needs enough overlap */
    static double ncc(Img a, Img r, double s, double tx, double ty, int step) {
        double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; int n = 0, tot = 0;
        for (int y = 0; y < a.h; y += step) for (int x = 0; x < a.w; x += step) {
            tot++;
            float v = samp(r, s * x + tx, s * y + ty); if (Float.isNaN(v)) continue;
            float u = a.g[y * a.w + x]; sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v; n++;
        }
        // overlap must be a fair part of what could overlap at this scale
        double can = Math.min(tot, (double) r.w * r.h / (s * s * step * step));
        if (n < 60 || n < 0.35 * can) return -1;
        double ma = sa / n, mb = sb / n, va = saa / n - ma * ma, vb = sbb / n - mb * mb;
        if (va < 1e-3 || vb < 1e-3) return -1;
        return (sab / n - ma * mb) / Math.sqrt(va * vb);
    }

    /* ---------- FFT phase correlation ---------- */
    static void fft(double[] re, double[] im, boolean inv) {
        int n = re.length;
        for (int i = 1, j = 0; i < n; i++) { int bit = n >> 1; for (; (j & bit) != 0; bit >>= 1) j ^= bit; j ^= bit;
            if (i < j) { double t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
        for (int len = 2; len <= n; len <<= 1) {
            double ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
            for (int i = 0; i < n; i += len) { double cr = 1, ci = 0;
                for (int j = 0; j < len / 2; j++) {
                    int a = i + j, b = a + len / 2; double xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
                    double nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
        }
        if (inv) for (int i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
    static void fft2(double[] re, double[] im, int N, boolean inv) {
        double[] r = new double[N], i = new double[N];
        for (int y = 0; y < N; y++) { System.arraycopy(re, y * N, r, 0, N); System.arraycopy(im, y * N, i, 0, N); fft(r, i, inv); System.arraycopy(r, 0, re, y * N, N); System.arraycopy(i, 0, im, y * N, N); }
        for (int x = 0; x < N; x++) { for (int y = 0; y < N; y++) { r[y] = re[y * N + x]; i[y] = im[y * N + x]; } fft(r, i, inv); for (int y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i[y]; } }
    }
    static double hann(double t) { return t <= 0 || t >= 1 ? 0 : Math.pow(Math.sin(Math.PI * t), 2); }

    /** spectrum of the reference, windowed, placed at the corner of an N×N square */
    static double[][] refSpec(Img r, int N) {
        double[] re = new double[N * N], im = new double[N * N]; double m = 0; for (float v : r.g) m += v; m /= r.g.length;
        for (int y = 0; y < Math.min(r.h, N); y++) for (int x = 0; x < Math.min(r.w, N); x++) re[y * N + x] = (r.g[y * r.w + x] - m) * hann((x + .5) / r.w) * hann((y + .5) / r.h);
        fft2(re, im, N, false); return new double[][]{re, im};
    }

    /** best placement of a inside r at scale s: {tx, ty, ncc} (t in r pixels) */
    static double[] atScale(Img a, Img r, double[][] R, int N, double s) {
        double[] re = new double[N * N], im = new double[N * N]; double m = 0; for (float v : a.g) m += v; m /= a.g.length;
        double u0 = N / 2.0 - s * a.w / 2, v0 = N / 2.0 - s * a.h / 2;
        for (int v = 0; v < N; v++) for (int u = 0; u < N; u++) {
            double px = (u - u0) / s, py = (v - v0) / s;
            float val = samp(a, px, py); if (Float.isNaN(val)) continue;
            re[v * N + u] = (val - m) * hann((px + .5) / a.w) * hann((py + .5) / a.h);
        }
        fft2(re, im, N, false);
        for (int k = 0; k < N * N; k++) {   // R · conj(A), whitened
            double xr = R[0][k] * re[k] + R[1][k] * im[k], xi = R[1][k] * re[k] - R[0][k] * im[k], mg = Math.hypot(xr, xi) + 1e-9;
            re[k] = xr / mg; im[k] = xi / mg;
        }
        fft2(re, im, N, true);
        // a few highest peaks, each checked by direct correlation
        double[] best = {0, 0, -2};
        boolean[] used = new boolean[N * N];
        for (int pk = 0; pk < 4; pk++) {
            int bi = -1; double bv = -1e18;
            for (int k = 0; k < N * N; k++) if (!used[k] && re[k] > bv) { bv = re[k]; bi = k; }
            if (bi < 0) break;
            int py = bi / N, px = bi % N;
            for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) used[((py + dy + N) % N) * N + (px + dx + N) % N] = true;
            int dx = px >= N / 2 ? px - N : px, dy = py >= N / 2 ? py - N : py;
            double tx = u0 + dx, ty = v0 + dy, c = ncc(a, r, s, tx, ty, 1);
            if (c > best[2]) best = new double[]{tx, ty, c};
        }
        return best;
    }

    /** searches scale (sMin..sMax) and position: {s, tx, ty, ncc} */
    static double[] search(Img a, Img r, int N, double sMin, double sMax, double ratio) {
        double[][] R = refSpec(r, N); double[] best = {1, 0, 0, -2};
        for (double s = sMin; s <= sMax * 1.0001; s *= ratio) {
            double[] b = atScale(a, r, R, N, s);
            if (b[2] > best[3]) best = new double[]{s, b[0], b[1], b[2]};
        }
        return best;
    }

    /** final polishing by direct correlation around a known answer (same picture factor for a and r) */
    static double[] polish(Img a, Img r, double s0, double tx0, double ty0, int step) {
        double bs = s0, bx = tx0, by = ty0, bc = ncc(a, r, s0, tx0, ty0, step);
        for (int it = 0; it < 3; it++) {
            double ds = it == 0 ? 0.004 : it == 1 ? 0.0015 : 0.0005, dt = it == 0 ? 1 : it == 1 ? 0.5 : 0.25;
            boolean moved = true; int guard = 0;
            while (moved && guard++ < 40) { moved = false;
                for (int k = 0; k < 6; k++) {
                    double s = bs * (k == 0 ? 1 + ds : k == 1 ? 1 - ds : 1), x = bx + (k == 2 ? dt : k == 3 ? -dt : 0), y = by + (k == 4 ? dt : k == 5 ? -dt : 0);
                    // a scale change about the picture centre should not move it
                    if (k < 2) { x = bx - (s - bs) * a.w / 2; y = by - (s - bs) * a.h / 2; }
                    double c = ncc(a, r, s, x, y, step);
                    if (c > bc + 1e-6) { bc = c; bs = s; bx = x; by = y; moved = true; }
                }
            }
        }
        return new double[]{bs, bx, by, bc};
    }

    /** where picture a lies in reference r, any scale from ×0.12 to ×4: {s, tx, ty, ncc} with t in full pixels */
    static double[] coarse(int[] A, int[] R, int W, int H) {
        Img a16 = img(A, W, H, 16), r16 = img(R, W, H, 16), r4 = img(R, W, H, 4);
        double[] x = search(a16, r16, 128, 0.33, 4, 1.08);           // similar or zoomed out
        double[] y = search(a16, r4, 512, 0.12 * 4, 0.36 * 4, 1.08);  // zoomed far in: the reference looked at 4× finer
        double[] b = y[3] > x[3] ? new double[]{y[0] / 4, y[1] * 4, y[2] * 4, y[3]} : new double[]{x[0], x[1] * 16, x[2] * 16, x[3]};
        // q = s·p + t in full pixels: a at factor 16 means p16 = p/16, so t(full) = 16·t16 (or 4·t4)
        return b;
    }

    /** exact placement once the reference is at a similar zoom: {s, tx, ty, ncc} in full pixels */
    static double[] fine(int[] A, int[] R, int W, int H, double sEst) {
        Img a8 = img(A, W, H, 8), r8 = img(R, W, H, 8);
        double[] f = search(a8, r8, 256, sEst * 0.88, sEst * 1.12, 1.01);
        Img a2 = img(A, W, H, 2), r2 = img(R, W, H, 2);
        double[] p = polish(a2, r2, f[0], f[1] * 4, f[2] * 4, 3);
        return new double[]{p[0], p[1] * 2, p[2] * 2, p[3]};
    }

    /** how many pixels picture b is moved to the left of picture a (the centre moved east) */
    static double shiftX(int[] A, int[] B, int W, int H) {
        final int f = 4; Img a = img(A, W, H, f), b = img(B, W, H, f); int w = a.w, h = a.h;
        int y0 = h / 5, y1 = h * 4 / 5, best = -1; double bs = 1e18;
        for (int s = Math.max(3, w / 25); s < w * 0.8; s++) {
            double sum = 0; int n = 0;
            for (int y = y0; y < y1; y += 2) for (int x = s; x < w; x += 2) { sum += Math.abs(a.g[y * w + x] - b.g[y * w + x - s]); n++; }
            if (n < 200) continue; double m = sum / n; if (m < bs) { bs = m; best = s; }
        }
        if (best < 0) return -1;
        // exact: 2-D correlation polish with scale fixed at 1
        Img a2 = img(A, W, H, 2), b2 = img(B, W, H, 2);
        double[] p = polishT(a2, b2, -best * 2.0, 0, 3);
        return -p[0] * 2;
    }
    static double[] polishT(Img a, Img r, double tx0, double ty0, int step) {
        double bx = tx0, by = ty0, bc = ncc(a, r, 1, tx0, ty0, step);
        for (double dt : new double[]{2, 1, 0.5, 0.25, 0.125}) {
            boolean moved = true; int g = 0;
            while (moved && g++ < 40) { moved = false;
                for (int k = 0; k < 4; k++) { double x = bx + (k == 0 ? dt : k == 1 ? -dt : 0), y = by + (k == 2 ? dt : k == 3 ? -dt : 0);
                    double c = ncc(a, r, 1, x, y, step); if (c > bc + 1e-7) { bc = c; bx = x; by = y; moved = true; } } }
        }
        return new double[]{bx, by, bc};
    }
}
