// Mosaicos engine — runs in the browser today, ports to a Tauri/Rust backend later.
//
//   • load a source image and a library folder of photos
//   • analyze each photo into a 4×4 Lab signature (the cached "color signature")
//   • match every source tile to the best photo by perceptual signature,
//     honoring reuse mode + min-distance
//   • render with true object-fit: cover (fill + center-crop, never stretch)
//   • export a high-res PNG at print resolution

import AnalyzeWorker from "./analyze.worker.ts?worker";
import { REGIONS, STRIDE, rgb2lab } from "./color";
import {
  saveSource,
  saveLibrary,
  loadSourceCache,
  loadLibraryCache,
  type SavedPhoto,
} from "./persist";
import { saveImage, isTauri, revealItem } from "./io";

export interface LibPhoto {
  bitmap: ImageBitmap; // 128px display tile bitmap
  sig: Float32Array; // 4×4 Lab signature (length STRIDE)
  top: boolean; // lives in the top-level folder (vs a subfolder)
  url: string; // object URL (original blob this session, thumb when restored)
  path?: string; // original file path (Tauri) — re-read full-res at export
}

export interface RuntimeState {
  source: ImageBitmap | null;
  sourceName: string;
  sourceUrl: string;
  library: LibPhoto[];
  libraryPath: string;
  scanning: boolean;
  scanned: number;
  scanTotal: number;
}

export const engine = $state<RuntimeState>({
  source: null,
  sourceName: "",
  sourceUrl: "",
  library: [],
  libraryPath: "",
  scanning: false,
  scanned: 0,
  scanTotal: 0,
});

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|avif|heic)$/i;

// shared offscreen canvas for sampling the source image
const sampler = document.createElement("canvas");
const sctx = sampler.getContext("2d", { willReadFrequently: true })!;

export async function loadSource(blob: Blob, name: string): Promise<void> {
  const full = await createImageBitmap(blob);
  engine.source?.close();
  if (engine.sourceUrl) URL.revokeObjectURL(engine.sourceUrl);
  engine.source = full;
  engine.sourceName = name;
  engine.sourceUrl = URL.createObjectURL(blob);
  saveSource({ blob, name });
}

/** Restore the source + library cached from a previous session (on app start). */
export async function restore(): Promise<void> {
  try {
    const [src, lib] = await Promise.all([loadSourceCache(), loadLibraryCache()]);
    if (src && !engine.source) {
      engine.source = await createImageBitmap(src.blob);
      engine.sourceName = src.name;
      engine.sourceUrl = URL.createObjectURL(src.blob);
    }
    if (lib && lib.photos.length && engine.library.length === 0) {
      const out: LibPhoto[] = [];
      for (const p of lib.photos) {
        out.push({
          bitmap: await createImageBitmap(p.thumb),
          sig: p.sig,
          top: p.top,
          url: URL.createObjectURL(p.thumb),
          path: p.path,
        });
      }
      engine.library = out;
      engine.libraryPath = lib.path;
      engine.scanned = out.length;
      engine.scanTotal = out.length;
    }
  } catch {
    // ignore cache errors — user can just re-pick
  }
}

/** Source image aspect ratio (w/h); defaults to 3:2 landscape before one loads. */
export function sourceAspect(): number {
  return engine.source ? engine.source.width / engine.source.height : 1.5;
}

/** A picked photo, environment-agnostic (browser File or Tauri-read bytes). */
export interface RawPhoto {
  blob: Blob;
  name: string;
  top: boolean;
  path?: string; // original file path (Tauri only)
}

export async function loadLibrary(items: RawPhoto[], rootName: string): Promise<void> {
  const imgs = items.filter((it) => IMAGE_RE.test(it.name));
  for (const p of engine.library) {
    p.bitmap.close();
    URL.revokeObjectURL(p.url);
  }
  engine.library = [];
  engine.libraryPath = rootName;
  engine.scanning = true;
  engine.scanned = 0;
  engine.scanTotal = imgs.length;

  const urls = imgs.map((it) => URL.createObjectURL(it.blob));
  const result: (LibPhoto | undefined)[] = new Array(imgs.length);
  const saved: (SavedPhoto | undefined)[] = new Array(imgs.length);

  try {
    await analyzeWithWorker(imgs, urls, result, saved);
  } catch {
    await analyzeInline(imgs, urls, result, saved);
  }

  const out: LibPhoto[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i]) out.push(result[i]!);
    else URL.revokeObjectURL(urls[i]);
  }
  engine.library = out;
  engine.scanning = false;
  saveLibrary({ path: rootName, photos: saved.filter((s): s is SavedPhoto => !!s) });
}

interface BatchMsg {
  type: "batch";
  done: number;
  photos: Array<{ index: number; sig: Float32Array; bitmap: ImageBitmap; thumb: Blob }>;
}
interface DoneMsg {
  type: "done";
}

function analyzeWithWorker(
  imgs: RawPhoto[],
  urls: string[],
  result: (LibPhoto | undefined)[],
  saved: (SavedPhoto | undefined)[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new AnalyzeWorker();
    } catch (err) {
      reject(err);
      return;
    }
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.onmessage = (e: MessageEvent<BatchMsg | DoneMsg>) => {
      const m = e.data;
      if (m.type === "batch") {
        for (const p of m.photos) {
          result[p.index] = {
            bitmap: p.bitmap,
            sig: p.sig,
            top: imgs[p.index].top,
            url: urls[p.index],
            path: imgs[p.index].path,
          };
          saved[p.index] = {
            sig: p.sig,
            thumb: p.thumb,
            top: imgs[p.index].top,
            path: imgs[p.index].path,
          };
        }
        engine.scanned = m.done;
      } else {
        worker.terminate();
        resolve();
      }
    };
    worker.postMessage({ items: imgs.map((it) => ({ blob: it.blob, top: it.top })) });
  });
}

async function analyzeInline(
  imgs: RawPhoto[],
  urls: string[],
  result: (LibPhoto | undefined)[],
  saved: (SavedPhoto | undefined)[],
): Promise<void> {
  const box = document.createElement("canvas");
  const bctx = box.getContext("2d")!;
  const sig = document.createElement("canvas");
  sig.width = REGIONS;
  sig.height = REGIONS;
  const sigctx = sig.getContext("2d", { willReadFrequently: true })!;
  for (let i = 0; i < imgs.length; i++) {
    try {
      const full = await createImageBitmap(imgs[i].blob);
      sigctx.clearRect(0, 0, REGIONS, REGIONS);
      sigctx.drawImage(full, 0, 0, REGIONS, REGIONS);
      const data = sigctx.getImageData(0, 0, REGIONS, REGIONS).data;
      const s = new Float32Array(STRIDE);
      let minL = Infinity;
      for (let k = 0; k < REGIONS * REGIONS; k++) {
        const o = k * 4;
        const [L, a, b] = rgb2lab(data[o], data[o + 1], data[o + 2]);
        s[k * 3] = L;
        s[k * 3 + 1] = a;
        s[k * 3 + 2] = b;
        if (L < minL) minL = L;
      }
      if (minL > 92) {
        full.close(); // skip blank/near-white scan
      } else {
        const scale = Math.min(1, 128 / Math.max(full.width, full.height));
        const w = Math.max(1, Math.round(full.width * scale));
        const h = Math.max(1, Math.round(full.height * scale));
        box.width = w;
        box.height = h;
        bctx.clearRect(0, 0, w, h);
        bctx.drawImage(full, 0, 0, w, h);
        const bitmap = await createImageBitmap(box);
        const thumb = await new Promise<Blob>((res) =>
          box.toBlob((b) => res(b!), "image/jpeg", 0.85),
        );
        full.close();
        result[i] = { bitmap, sig: s, top: imgs[i].top, url: urls[i], path: imgs[i].path };
        saved[i] = { sig: s, thumb, top: imgs[i].top, path: imgs[i].path };
      }
    } catch {
      // skip unreadable files
    }
    engine.scanned = i + 1;
    if (i % 24 === 0) await new Promise((res) => setTimeout(res, 0));
  }
}

/**
 * A card is "blank" if it's overwhelmingly light AND low-contrast — i.e. a blank
 * or near-empty scan. Such cards read as white tiles, so we exclude them from
 * matching (computed from the signature, so it works on already-loaded libraries
 * with no re-scan).
 */
function isBlank(sig: Float32Array): boolean {
  let sum = 0,
    min = Infinity,
    max = -Infinity;
  for (let k = 0; k < REGIONS * REGIONS; k++) {
    const L = sig[k * 3];
    sum += L;
    if (L < min) min = L;
    if (L > max) max = L;
  }
  const mean = sum / (REGIONS * REGIONS);
  return mean > 86 && max - min < 16;
}

export function includedLibrary(includeSubfolders: boolean): LibPhoto[] {
  const base = includeSubfolders ? engine.library : engine.library.filter((p) => p.top);
  return base.filter((p) => !isBlank(p.sig));
}

export interface SourceSignature {
  sig: Float32Array; // total × STRIDE, per-tile Lab signatures
  rgb: Float32Array; // total × 3, per-tile average RGB (for color-match tint)
}

/** Sample the source into across×down tiles, each a 4×4 Lab signature + avg RGB. */
export function analyzeSource(
  source: ImageBitmap,
  across: number,
  down: number,
): SourceSignature {
  const sw = across * REGIONS;
  const sh = down * REGIONS;
  sampler.width = sw;
  sampler.height = sh;
  sctx.clearRect(0, 0, sw, sh);
  sctx.drawImage(source, 0, 0, sw, sh);
  const data = sctx.getImageData(0, 0, sw, sh).data;
  const total = across * down;
  const sig = new Float32Array(total * STRIDE);
  const rgb = new Float32Array(total * 3);
  for (let ty = 0; ty < down; ty++) {
    for (let tx = 0; tx < across; tx++) {
      const ci = ty * across + tx;
      let sr = 0,
        sg = 0,
        sb = 0;
      for (let ry = 0; ry < REGIONS; ry++) {
        for (let rx = 0; rx < REGIONS; rx++) {
          const px = tx * REGIONS + rx;
          const py = ty * REGIONS + ry;
          const o = (py * sw + px) * 4;
          const r = data[o],
            g = data[o + 1],
            b = data[o + 2];
          const k = ry * REGIONS + rx;
          const [L, A, B] = rgb2lab(r, g, b);
          const base = ci * STRIDE + k * 3;
          sig[base] = L;
          sig[base + 1] = A;
          sig[base + 2] = B;
          sr += r;
          sg += g;
          sb += b;
        }
      }
      const n = REGIONS * REGIONS;
      rgb[ci * 3] = sr / n;
      rgb[ci * 3 + 1] = sg / n;
      rgb[ci * 3 + 2] = sb / n;
    }
  }
  return { sig, rgb };
}

/**
 * Assign a library photo to every tile. Row-major, greedy nearest-signature,
 * respecting Unique-only and min-distance-between-repeats. Falls back to plain
 * nearest if constraints can't be met, so the mosaic always finishes 100%.
 */
export function buildPlan(
  src: SourceSignature,
  lib: LibPhoto[],
  across: number,
  down: number,
  reuseMode: "Allow repeats" | "Unique only",
  minDistance: number,
  maxUses: number,
): Int32Array {
  const plan = new Int32Array(across * down).fill(-1);
  if (lib.length === 0) return plan;
  const unique = reuseMode === "Unique only";
  const used = new Set<number>();
  const uses = new Int32Array(lib.length);
  const cap = unique ? 1 : maxUses > 0 ? maxUses : 0; // 0 = unlimited
  const sig = src.sig;
  const md = unique ? 0 : minDistance;
  const total = across * down;

  // Assign the most *distinctive* tiles first — those whose color is farthest
  // from the image's average (the dark beard, the bright flag) — so they claim
  // their best-fitting card before the pool drains. Flat mid-tone tiles, which
  // many cards match, are assigned last. Biggest quality win, esp. Unique only.
  const mean = new Float32Array(STRIDE);
  for (let ci = 0; ci < total; ci++) {
    const base = ci * STRIDE;
    for (let j = 0; j < STRIDE; j++) mean[j] += sig[base + j];
  }
  for (let j = 0; j < STRIDE; j++) mean[j] /= total;
  const distinct = new Float32Array(total);
  for (let ci = 0; ci < total; ci++) {
    const base = ci * STRIDE;
    let d = 0;
    for (let j = 0; j < STRIDE; j++) {
      const diff = sig[base + j] - mean[j];
      d += diff * diff;
    }
    distinct[ci] = d;
  }
  const order = Array.from({ length: total }, (_, i) => i);
  order.sort((a, b) => distinct[b] - distinct[a]);

  // Forbidden = cards already placed within Chebyshev distance < md of (x,y).
  // Scans the full neighborhood (tiles are assigned out of raster order now).
  const forbidden = new Set<number>();
  const collectForbidden = (x: number, y: number) => {
    forbidden.clear();
    if (md <= 0) return;
    const y0 = Math.max(0, y - (md - 1));
    const y1 = Math.min(down - 1, y + (md - 1));
    const x0 = Math.max(0, x - (md - 1));
    const x1 = Math.min(across - 1, x + (md - 1));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        if (xx === x && yy === y) continue;
        const idx = plan[yy * across + xx];
        if (idx >= 0) forbidden.add(idx);
      }
    }
  };

  for (const ci of order) {
    const x = ci % across;
    const y = (ci / across) | 0;
    const base = ci * STRIDE;
    collectForbidden(x, y);
    let best = -1,
      bestD = Infinity;
    let fallbackBest = -1,
      fallbackD = Infinity;
    for (let k = 0; k < lib.length; k++) {
      const ps = lib[k].sig;
      let d = 0;
      for (let j = 0; j < STRIDE; j++) {
        const diff = sig[base + j] - ps[j];
        d += diff * diff;
      }
      // best ignoring constraints — used only if every candidate is blocked
      if (d < fallbackD) {
        fallbackD = d;
        fallbackBest = k;
      }
      if (unique && used.has(k)) continue;
      if (cap > 0 && uses[k] >= cap) continue;
      if (forbidden.has(k)) continue;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (fallbackBest < 0) fallbackBest = 0; // never leave a tile empty
    const chosen = best >= 0 ? best : fallbackBest; // always finishes
    plan[ci] = chosen;
    used.add(chosen);
    uses[chosen]++;
  }
  return plan;
}

/**
 * object-fit: cover — scale the bitmap to fill the box, center-crop overflow.
 *
 * Implemented as clip-to-cell + whole-bitmap draw (4-arg drawImage), NOT the
 * 9-arg source-rectangle form. WebKit silently drops the 9-arg drawImage when
 * the scale is ~1:1 (a tile drawn into a cell nearly its own size) — that was
 * the white-tile bug. The clip approach is drop-free at every scale.
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const s = Math.max(dw / bmp.width, dh / bmp.height);
  const w2 = bmp.width * s;
  const h2 = bmp.height * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.drawImage(bmp, dx + (dw - w2) / 2, dy + (dh - h2) / 2, w2, h2);
  ctx.restore();
}

export interface RenderOpts {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  originX: number;
  originY: number;
  cellW: number;
  cellH: number;
  tileRgb: Float32Array; // total × 3 (for color-match tint)
  plan: Int32Array;
  lib: LibPhoto[];
  across: number;
  down: number;
  placed: number;
  colorMatch: number;
  leadingEdge: boolean;
}

export function renderMosaic(o: RenderOpts): void {
  const { ctx, originX, originY, cellW, cellH } = o;
  const { tileRgb, plan, lib, across, down, placed, colorMatch, leadingEdge } = o;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(originX, originY, cellW * across, cellH * down);

  const total = across * down;
  const tint = Math.max(0, Math.min(1, colorMatch / 100));
  const tw = Math.ceil(cellW) + 1;
  const th = Math.ceil(cellH) + 1;

  const n = Math.min(placed, total);
  for (let ci = 0; ci < n; ci++) {
    const x = originX + (ci % across) * cellW;
    const y = originY + Math.floor(ci / across) * cellH;
    const idx = plan[ci];
    if (idx >= 0 && lib[idx]) {
      drawCover(ctx, lib[idx].bitmap, x, y, tw, th);
      if (tint > 0) {
        ctx.save();
        ctx.globalAlpha = tint;
        ctx.fillStyle = `rgb(${tileRgb[ci * 3] | 0},${tileRgb[ci * 3 + 1] | 0},${tileRgb[ci * 3 + 2] | 0})`;
        ctx.fillRect(x, y, tw, th);
        ctx.restore();
      }
    }
  }

  if (leadingEdge && placed < total) {
    ctx.fillStyle = "#D8FF3E";
    for (let ci = placed; ci < Math.min(placed + across, total); ci++) {
      const x = originX + (ci % across) * cellW;
      const y = originY + Math.floor(ci / across) * cellH;
      ctx.fillRect(x, y, tw, th);
    }
  }
}

/** Load a card's original full-resolution image (Tauri: from disk; else its blob URL). */
async function loadOriginal(p: LibPhoto): Promise<Blob> {
  if (p.path && isTauri()) {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return new Blob([new Uint8Array(await readFile(p.path))]);
  }
  return await (await fetch(p.url)).blob();
}

/**
 * Render the full mosaic at print resolution and save a PNG.
 *
 * Iterates card-by-card: decode one original at full res, draw it into all of
 * its tiles, then free it — so memory stays flat (no multi-GB spike that drops
 * tiles at large sizes) and quality stays crisp. Every cell is pre-filled with
 * the source's average color, so a tile can never come out blank white.
 */
export async function exportHighRes(opts: {
  pxW: number;
  pxH: number;
  tileRgb: Float32Array;
  plan: Int32Array;
  lib: LibPhoto[];
  across: number;
  down: number;
  colorMatch: number;
  filename: string;
}): Promise<void> {
  const { pxW, pxH, across, down, plan, lib, tileRgb, colorMatch } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cellW = pxW / across;
  const cellH = pxH / down;
  const tw = Math.ceil(cellW) + 1;
  const th = Math.ceil(cellH) + 1;
  const tint = Math.max(0, Math.min(1, colorMatch / 100));
  const total = across * down;
  const xy = (ci: number): [number, number] => [(ci % across) * cellW, Math.floor(ci / across) * cellH];

  // 1) backfill every cell with the source's average color (guards against white)
  for (let ci = 0; ci < total; ci++) {
    const [x, y] = xy(ci);
    ctx.fillStyle = `rgb(${tileRgb[ci * 3] | 0},${tileRgb[ci * 3 + 1] | 0},${tileRgb[ci * 3 + 2] | 0})`;
    ctx.fillRect(x, y, tw, th);
  }

  // 2) group tiles by card, then draw card-by-card (one original in memory at a time)
  const byCard = new Map<number, number[]>();
  for (let ci = 0; ci < total; ci++) {
    const idx = plan[ci];
    if (idx < 0 || !lib[idx]) continue;
    const list = byCard.get(idx);
    if (list) list.push(ci);
    else byCard.set(idx, [ci]);
  }

  // Pre-resize each card to ~1.5× the cell size before drawing. WebKit's
  // drawImage can return blank when shrinking a large image by a big ratio with
  // high-quality smoothing (the cause of the missing tiles at Print/Large), so
  // we keep every draw a gentle scale — reliable at any export size, still crisp.
  const target = Math.max(24, Math.ceil(Math.max(cellW, cellH) * 1.5));
  let hiNull = 0;
  for (const [idx, cis] of byCard) {
    const base = lib[idx].bitmap; // 128px, always valid & in memory
    // hi-res original, pre-resized to ~1.5× cell (gentle final scale)
    let hi: ImageBitmap | null = null;
    try {
      const full = await createImageBitmap(await loadOriginal(lib[idx]));
      const scale = Math.min(1, target / Math.max(full.width, full.height));
      if (scale < 1) {
        hi = await createImageBitmap(full, {
          resizeWidth: Math.max(1, Math.round(full.width * scale)),
          resizeHeight: Math.max(1, Math.round(full.height * scale)),
          resizeQuality: "high",
        });
        full.close();
      } else {
        hi = full;
      }
    } catch {
      hi = null;
    }
    if (!hi) hiNull++;
    for (const ci of cis) {
      const [x, y] = xy(ci);
      drawCover(ctx, base, x, y, tw, th); // base layer: guarantees the card shows
      if (hi) drawCover(ctx, hi, x, y, tw, th); // crisp overlay when available
      if (tint > 0) {
        ctx.save();
        ctx.globalAlpha = tint;
        ctx.fillStyle = `rgb(${tileRgb[ci * 3] | 0},${tileRgb[ci * 3 + 1] | 0},${tileRgb[ci * 3 + 2] | 0})`;
        ctx.fillRect(x, y, tw, th);
        ctx.restore();
      }
    }
    if (hi && hi !== base) hi.close();
  }
  const out: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const savedPath = await saveImage(out, opts.filename);
  if (savedPath !== null || !isTauri()) {
    // a real save happened (native path, or a browser download); not a cancel
    lastExportInfo.hiNull = hiNull;
    lastExportInfo.path = savedPath ?? "";
  }
}

/** Last export info, shown in the status bar. `path` set only on native saves. */
export const lastExportInfo = $state({ hiNull: -1, path: "" });

/** Reveal the most recently exported file in Finder. */
export async function revealExport(): Promise<void> {
  if (lastExportInfo.path) await revealItem(lastExportInfo.path);
}
