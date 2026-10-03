import { decodeMask, encodeMask, type Progress } from "./storage";

// A normalized, persistent 96 × 64 removal mask survives resizing and refresh.
export const MASK_WIDTH = 96,
  MASK_HEIGHT = 64,
  MASK_BYTES = (MASK_WIDTH * MASK_HEIGHT) / 8;
export function eraseCircle(
  bytes: Uint8Array,
  u: number,
  v: number,
  ru: number,
  rv: number,
): number {
  let added = 0;
  for (
    let y = Math.max(0, Math.floor((v - rv) * MASK_HEIGHT));
    y < Math.min(MASK_HEIGHT, Math.ceil((v + rv) * MASK_HEIGHT));
    y++
  )
    for (
      let x = Math.max(0, Math.floor((u - ru) * MASK_WIDTH));
      x < Math.min(MASK_WIDTH, Math.ceil((u + ru) * MASK_WIDTH));
      x++
    ) {
      if (
        ((x + 0.5) / MASK_WIDTH - u) ** 2 / ru ** 2 +
          ((y + 0.5) / MASK_HEIGHT - v) ** 2 / rv ** 2 >
        1
      )
        continue;
      const n = y * MASK_WIDTH + x,
        bit = 1 << (n % 8),
        offset = n >>> 3;
      if (!(bytes[offset] & bit)) {
        bytes[offset] |= bit;
        added++;
      }
    }
  return added;
}
export function coveredCount(mask: Uint8Array): number {
  let count = 0;
  for (let byte of mask)
    while (byte) {
      byte &= byte - 1;
      count++;
    }
  return count;
}
export class Coating {
  private observers: ResizeObserver[] = [];
  private release: Array<() => void> = [];
  private timer?: ReturnType<typeof setTimeout>;
  private progress: Progress;
  private buffers: Uint8Array[];
  private counts: number[];
  private renderers: Array<() => void> = [];
  private disposed = false;
  brushRadius = 18;
  constructor(
    private root: HTMLElement,
    progress: Progress,
    private changed: (progress: Progress, complete: boolean) => void,
    private tap: () => void,
  ) {
    this.progress = structuredClone(progress);
    const zones = Array.from(
      root.querySelectorAll<HTMLElement>(".scratch-zone"),
    );
    this.buffers = zones.map((_, i) =>
      decodeMask(progress.masks[i] ?? "", MASK_BYTES),
    );
    this.counts = this.buffers.map(coveredCount);
    zones.forEach((zone, i) => this.bind(zone, i));
  }
  private bind(zone: HTMLElement, index: number) {
    const canvas = zone.querySelector("canvas")!,
      ctx = canvas.getContext("2d")!;
    let pointer: number | undefined,
      previous: { u: number; v: number } | undefined;
    const under = zone.querySelector<HTMLElement>(".printed")!;
    const artwork = new Image();
    artwork.src = zone.dataset.art ?? "";
    const paint = () => {
      if (this.disposed) return;
      const w = zone.clientWidth,
        h = zone.clientHeight,
        dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      zone.classList.toggle("revealed", !!this.progress.revealed[index]);
      under.setAttribute("aria-hidden", String(!this.progress.revealed[index]));
      if (this.progress.revealed[index]) return;
      ctx.globalCompositeOperation = "source-over";
      const metal = ctx.createLinearGradient(0, 0, w, h);
      metal.addColorStop(0, "#c7c9c5");
      metal.addColorStop(0.43, "#e6e6df");
      metal.addColorStop(0.55, "#c6c9c3");
      metal.addColorStop(1, "#dddcd3");
      ctx.fillStyle = metal;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,.32)";
      ctx.lineWidth = 1;
      for (let x = -h; x < w; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
      }
      const crop = (zone.dataset.crop ?? "").split(",").map(Number);
      if (artwork.complete && artwork.naturalWidth && crop.length === 4)
        ctx.drawImage(
          artwork,
          crop[0] * artwork.naturalWidth,
          crop[1] * artwork.naturalHeight,
          crop[2] * artwork.naturalWidth,
          crop[3] * artwork.naturalHeight,
          0,
          0,
          w,
          h,
        );
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = MASK_WIDTH;
      maskCanvas.height = MASK_HEIGHT;
      const mctx = maskCanvas.getContext("2d")!,
        pixels = mctx.createImageData(MASK_WIDTH, MASK_HEIGHT),
        bytes = this.buffers[index];
      for (let n = 0; n < MASK_WIDTH * MASK_HEIGHT; n++)
        if (bytes[n >>> 3] & (1 << (n % 8))) pixels.data[n * 4 + 3] = 255;
      mctx.putImageData(pixels, 0, 0);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(maskCanvas, 0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    };
    this.renderers[index] = paint;
    artwork.onload = paint;
    const observer = new ResizeObserver(paint);
    observer.observe(zone);
    this.observers.push(observer);
    paint();
    const move = (event: PointerEvent) => {
      if (pointer !== event.pointerId || this.progress.revealed[index]) return;
      const rect = canvas.getBoundingClientRect(),
        u = (event.clientX - rect.left) / rect.width,
        v = (event.clientY - rect.top) / rect.height;
      const radius = this.brushRadius,
        ru = radius / rect.width,
        rv = radius / rect.height;
      const steps = previous
        ? Math.max(
            1,
            Math.ceil(
              Math.hypot(
                (u - previous.u) * rect.width,
                (v - previous.v) * rect.height,
              ) /
                (radius * 0.45),
            ),
          )
        : 1;
      for (let s = 1; s <= steps; s++)
        this.counts[index] += eraseCircle(
          this.buffers[index],
          previous ? previous.u + ((u - previous.u) * s) / steps : u,
          previous ? previous.v + ((v - previous.v) * s) / steps : v,
          ru,
          rv,
        );
      previous = { u, v };
      if (this.counts[index] >= MASK_WIDTH * MASK_HEIGHT * 0.62)
        this.progress.revealed[index] = true;
      paint();
      this.schedule();
    };
    const down = (event: PointerEvent) => {
      if (
        pointer !== undefined ||
        this.progress.revealed[index] ||
        event.button !== 0 ||
        !event.isPrimary
      )
        return;
      event.preventDefault();
      pointer = event.pointerId;
      previous = undefined;
      canvas.setPointerCapture(pointer);
      this.tap();
      move(event);
    };
    const up = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      if (canvas.hasPointerCapture(pointer))
        canvas.releasePointerCapture(pointer);
      pointer = undefined;
      previous = undefined;
      this.flush();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up);
    this.release.push(() => {
      artwork.onload = null;
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
    });
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 140);
  }
  flush() {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.progress.masks = this.buffers.map(encodeMask);
    this.changed(
      structuredClone(this.progress),
      this.renderers.length > 0 &&
        this.renderers.every((_, i) => this.progress.revealed[i]),
    );
  }
  revealAll() {
    this.renderers.forEach((paint, i) => {
      this.progress.revealed[i] = true;
      paint();
    });
    this.flush();
  }
  revealRegion(index: number) {
    this.progress.revealed[index] = true;
    this.renderers[index]?.();
    this.flush();
  }
  dispose() {
    this.flush();
    this.disposed = true;
    this.observers.forEach((o) => o.disconnect());
    this.release.forEach((fn) => fn());
  }
}
