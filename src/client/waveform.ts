import { readAccentRgb } from "./ui";

export type Bars = { cur: number[]; vel: number[] };

export function drawWaveform(
  canvas: HTMLCanvasElement,
  bars: Bars,
  opts: { speaking: boolean; src?: Uint8Array | null; barCount?: number; idleRgb?: [number, number, number] },
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const BARS = opts.barCount ?? 56;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  if (bars.cur.length !== BARS) {
    bars.cur = new Array(BARS).fill(0);
    bars.vel = new Array(BARS).fill(0);
  }
  const src = opts.src;
  const now = Date.now();
  for (let i = 0; i < BARS; i++) {
    let target = 0;
    if (src && src.length) {
      const idx = Math.floor((i / BARS) * (src.length * 0.7));
      target = (src[idx] ?? 0) / 255;
    }
    if (!src || !src.length || target < 0.02) {
      if (opts.speaking) {
        const env = 0.5 + 0.5 * Math.sin(now / 140 + i * 0.6) * Math.sin(now / 373 + i * 0.21);
        target = (0.25 + 0.6 * Math.abs(env)) * (0.6 + 0.4 * Math.sin((i / BARS) * Math.PI));
      } else {
        target = 0.03 + 0.02 * Math.sin(now / 320 + i * 0.5);
      }
    }
    bars.vel[i] += (target - bars.cur[i]) * 0.22;
    bars.vel[i] *= 0.72;
    bars.cur[i] += bars.vel[i];
    if (bars.cur[i] < 0) bars.cur[i] = 0;
  }
  const mid = hgt / 2;
  const gap = 3;
  const bw = (w - gap * (BARS - 1)) / BARS;
  const accent = opts.speaking ? readAccentRgb() : (opts.idleRgb ?? [122, 115, 106]);
  for (let i = 0; i < BARS; i++) {
    const bh = Math.max(2, bars.cur[i] * (hgt * 0.9));
    const x = i * (bw + gap);
    const alpha = 0.55 + 0.45 * Math.sin((i / BARS) * Math.PI);
    ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`;
    const r = Math.min(bw / 2, 4);
    ctx.beginPath();
    ctx.moveTo(x + r, mid - bh / 2);
    ctx.arcTo(x + bw, mid - bh / 2, x + bw, mid + bh / 2, r);
    ctx.arcTo(x + bw, mid + bh / 2, x, mid + bh / 2, r);
    ctx.arcTo(x, mid + bh / 2, x, mid - bh / 2, r);
    ctx.arcTo(x, mid - bh / 2, x + bw, mid - bh / 2, r);
    ctx.closePath();
    ctx.fill();
  }
}
