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
export interface ScratchBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
// One pointer-captured sheet; zone masks remain compatible with existing saved tickets.
export function strokeZones(
  buffers: Uint8Array[],
  zones: ScratchBounds[],
  from: { x: number; y: number } | undefined,
  to: { x: number; y: number },
  radius: number,
): Set<number> {
  const changed = new Set<number>();
  const steps = from
    ? Math.max(
        1,
        Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (radius * 0.45)),
      )
    : 1;
  for (let step = 1; step <= steps; step++) {
    const x = from ? from.x + ((to.x - from.x) * step) / steps : to.x,
      y = from ? from.y + ((to.y - from.y) * step) / steps : to.y;
    zones.forEach((z, i) => {
      if (
        x + radius < z.x ||
        x - radius > z.x + z.w ||
        y + radius < z.y ||
        y - radius > z.y + z.h
      )
        return;
      if (
        eraseCircle(
          buffers[i],
          (x - z.x) / z.w,
          (y - z.y) / z.h,
          radius / z.w,
          radius / z.h,
        )
      )
        changed.add(i);
    });
  }
  return changed;
}
export class Coating {
  private observer: ResizeObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private progress: Progress;
  private buffers: Uint8Array[];
  private zones: HTMLElement[];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private artwork = new Image();
  private paper: HTMLElement;
  private bounds: ScratchBounds[] = [];
  private sheet = { x: 0, y: 0, w: 1, h: 1 };
  private pointer?: number;
  private previous?: { x: number; y: number };
  private disposed = false;
  private frame = 0;
  private geometryDirty = false;
  private started = false;
  private progressDirty = false;
  brushRadius = 18;
  constructor(
    private root: HTMLElement,
    progress: Progress,
    private changed: (progress: Progress, complete: boolean) => void,
    private tap: () => void,
  ) {
    this.progress = structuredClone(progress);
    this.zones = Array.from(
      root.querySelectorAll<HTMLElement>(".scratch-zone"),
    );
    this.buffers = Array.from({ length: this.zones.length + 1 }, (_, i) =>
      decodeMask(progress.masks[i] ?? "", MASK_BYTES),
    );
    this.paper = document.createElement("div");
    this.paper.className = "scratch-paper";
    this.paper.setAttribute("aria-hidden", "true");
    this.zones[0].before(this.paper);
    this.canvas = root.querySelector<HTMLCanvasElement>(".scratch-sheet")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("pointerdown", this.down);
    this.canvas.addEventListener("pointermove", this.move);
    this.canvas.addEventListener("pointerup", this.up);
    this.canvas.addEventListener("pointercancel", this.up);
    this.canvas.addEventListener("lostpointercapture", this.up);
    this.observer = new ResizeObserver(() => {
      this.geometryDirty = true;
      this.paintSoon();
    });
    this.observer.observe(this.canvas.parentElement!);
    this.artwork.onload = () => {
      this.geometryDirty = true;
      this.paintSoon();
    };
    this.artwork.src = this.canvas.dataset.art ?? "";
    this.resize();
  }
  private paintSoon() {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.geometryDirty) {
        this.geometryDirty = false;
        this.resize();
      }
    });
  }
  private resize() {
    if (this.disposed) return;
    const parent = this.canvas.parentElement!,
      w = parent.clientWidth,
      h = parent.clientHeight;
    this.bounds = this.zones.map((z) => ({
      x: z.offsetLeft,
      y: z.offsetTop,
      w: z.offsetWidth,
      h: z.offsetHeight,
    }));
    const x = Math.min(...this.bounds.map((z) => z.x)),
      y = Math.min(...this.bounds.map((z) => z.y));
    this.sheet = {
      x,
      y,
      w: Math.max(...this.bounds.map((z) => z.x + z.w)) - x,
      h: Math.max(...this.bounds.map((z) => z.y + z.h)) - y,
    };
    const style = {
      left: x + "px",
      top: y + "px",
      width: this.sheet.w + "px",
      height: this.sheet.h + "px",
    };
    Object.assign(this.canvas.style, style);
    Object.assign(this.paper.style, style);
    const dpr = Math.min(2, devicePixelRatio || 1),
      ctx = this.ctx;
    this.canvas.width = Math.max(1, Math.round(this.sheet.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.sheet.h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const metal = ctx.createLinearGradient(0, 0, this.sheet.w, this.sheet.h);
    metal.addColorStop(0, "#deded5");
    metal.addColorStop(0.5, "#c9ccc5");
    metal.addColorStop(1, "#e5e5dc");
    ctx.fillStyle = metal;
    ctx.fillRect(0, 0, this.sheet.w, this.sheet.h);
    const crop = (this.canvas.dataset.crop ?? "0,0,1,1").split(",").map(Number);
    if (this.artwork.complete && this.artwork.naturalWidth)
      ctx.drawImage(
        this.artwork,
        (crop[0] + (x / w) * crop[2]) * this.artwork.naturalWidth,
        (crop[1] + (y / h) * crop[3]) * this.artwork.naturalHeight,
        (this.sheet.w / w) * crop[2] * this.artwork.naturalWidth,
        (this.sheet.h / h) * crop[3] * this.artwork.naturalHeight,
        0,
        0,
        this.sheet.w,
        this.sheet.h,
      );
    const gap = document.createElement("canvas");
    gap.width = MASK_WIDTH;
    gap.height = MASK_HEIGHT;
    const gc = gap.getContext("2d")!,
      gp = gc.createImageData(MASK_WIDTH, MASK_HEIGHT),
      gb = this.buffers[this.zones.length];
    for (let n = 0; n < MASK_WIDTH * MASK_HEIGHT; n++)
      if (gb[n >>> 3] & (1 << (n % 8))) gp.data[n * 4 + 3] = 255;
    gc.putImageData(gp, 0, 0);
    const gaps = new Path2D();
    gaps.rect(0, 0, this.sheet.w, this.sheet.h);
    this.bounds.forEach((z) => gaps.rect(z.x - x, z.y - y, z.w, z.h));
    ctx.save();
    ctx.clip(gaps, "evenodd");
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(gap, 0, 0, this.sheet.w, this.sheet.h);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    this.zones.forEach((zone, i) => {
      const z = this.bounds[i];
      zone.classList.toggle("revealed", !!this.progress.revealed[i]);
      zone
        .querySelector(".printed")!
        .setAttribute("aria-hidden", String(!this.progress.revealed[i]));
      ctx.globalCompositeOperation = "destination-out";
      if (this.progress.revealed[i]) ctx.clearRect(z.x - x, z.y - y, z.w, z.h);
      else {
        const mask = document.createElement("canvas");
        mask.width = MASK_WIDTH;
        mask.height = MASK_HEIGHT;
        const mc = mask.getContext("2d")!,
          pixels = mc.createImageData(MASK_WIDTH, MASK_HEIGHT);
        for (let n = 0; n < MASK_WIDTH * MASK_HEIGHT; n++)
          if (this.buffers[i][n >>> 3] & (1 << (n % 8)))
            pixels.data[n * 4 + 3] = 255;
        mc.putImageData(pixels, 0, 0);
        ctx.drawImage(mask, z.x - x, z.y - y, z.w, z.h);
      }
      ctx.globalCompositeOperation = "source-over";
    });
    this.canvas.classList.toggle(
      "fully-scratched",
      this.zones.every((_, i) => this.progress.revealed[i]),
    );
  }
  private down = (event: PointerEvent) => {
    if (
      this.pointer !== undefined ||
      event.button !== 0 ||
      !event.isPrimary ||
      this.canvas.classList.contains("fully-scratched")
    )
      return;
    event.preventDefault();
    this.pointer = event.pointerId;
    this.previous = undefined;
    this.canvas.setPointerCapture(event.pointerId);
    if (!this.started) {
      this.started = true;
      this.tap();
    }
    this.move(event);
  };
  private move = (event: PointerEvent) => {
    if (this.pointer !== event.pointerId) return;
    event.preventDefault();
    // Use a single interpolated path through every zone, including the spaces between them.
    const rect = this.canvas.getBoundingClientRect(),
      sx = this.sheet.w / rect.width,
      sy = this.sheet.h / rect.height;
    const events =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    for (const input of events.length ? events : [event]) {
      const to = {
          x: this.sheet.x + (input.clientX - rect.left) * sx,
          y: this.sheet.y + (input.clientY - rect.top) * sy,
        },
        radius = this.brushRadius * sx;
      const dirty = strokeZones(
          this.buffers,
          [...this.bounds, this.sheet],
          this.previous,
          to,
          radius,
        ),
        ctx = this.ctx;
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = radius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(
        (this.previous ?? to).x - this.sheet.x,
        (this.previous ?? to).y - this.sheet.y,
      );
      ctx.lineTo(to.x - this.sheet.x, to.y - this.sheet.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(to.x - this.sheet.x, to.y - this.sheet.y, radius, 0, Math.PI * 2);
      ctx.fill();
      dirty.forEach((i) => {
        if (i >= this.zones.length) return;
        if (
          !this.progress.revealed[i] &&
          coveredCount(this.buffers[i]) >= MASK_WIDTH * MASK_HEIGHT * 0.62
        ) {
          this.progress.revealed[i] = true;
          const z = this.bounds[i];
          ctx.clearRect(z.x - this.sheet.x, z.y - this.sheet.y, z.w, z.h);
          this.zones[i].classList.add("revealed");
          this.zones[i]
            .querySelector(".printed")!
            .setAttribute("aria-hidden", "false");
        }
      });
      ctx.globalCompositeOperation = "source-over";
      this.previous = to;
    }
    this.canvas.classList.toggle(
      "fully-scratched",
      this.zones.every((_, i) => this.progress.revealed[i]),
    );
    this.progressDirty = true;
    this.schedule();
  };
  private up = (event: PointerEvent) => {
    if (this.pointer !== event.pointerId) return;
    const id = this.pointer;
    this.pointer = undefined;
    this.previous = undefined;
    if (this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
    this.flush();
  };
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }
  flush(force = false) {
    if (this.disposed || (!this.progressDirty && !force)) return;
    this.progressDirty = false;
    clearTimeout(this.timer);
    this.progress.masks = this.buffers.map(encodeMask);
    this.changed(
      structuredClone(this.progress),
      this.zones.length > 0 &&
        this.zones.every((_, i) => this.progress.revealed[i]),
    );
  }
  revealAll() {
    this.progressDirty = true;
    this.zones.forEach((_, i) => (this.progress.revealed[i] = true));
    this.resize();
    this.flush();
  }
  revealRegion(index: number) {
    this.progressDirty = true;
    this.progress.revealed[index] = true;
    this.resize();
    this.flush();
  }
  dispose() {
    this.flush();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.artwork.onload = null;
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.up);
    this.canvas.removeEventListener("lostpointercapture", this.up);
  }
}
