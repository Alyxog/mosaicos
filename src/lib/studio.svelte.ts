// Reactive studio state + derived display values.
//
// Tiles are defined by an aspect RATIO (not physical mm),
// and a target TILE COUNT. The grid (across × down) is derived from the source
// image's aspect ratio so the mosaic always matches the picture's shape, and it
// re-derives live as you change the tile ratio or count.

export type ReuseMode = "Allow repeats" | "Unique only";
export type ExportSize = "Web" | "Print" | "Large" | "Max";

export interface StudioState {
  tileRatioW: number; // tile shape, e.g. 9 in 9:5
  tileRatioH: number; // tile shape, e.g. 5 in 9:5
  tileCount: number; // target total number of tiles
  includeSubfolders: boolean;
  colorMatch: number; // 0..100
  minDistance: number; // 0..30 (tiles between repeats)
  maxUses: number; // 0 = unlimited, else cap on how many tiles one card can fill
  reuseMode: ReuseMode;
  exportSize: ExportSize;
  buildPercent: number; // 0..100
}

export const state = $state<StudioState>({
  tileRatioW: 3, // 50×85mm cards ≈ 3:5
  tileRatioH: 5,
  tileCount: 1600,
  includeSubfolders: true,
  colorMatch: 0, // true photos, no tint (default)
  minDistance: 8,
  maxUses: 0, // unlimited by default
  reuseMode: "Unique only",
  exportSize: "Print",
  buildPercent: 100, // a finished mosaic; drag the status bar to scrub the build
});

export const TILE_COUNT_MIN = 100;
export const TILE_COUNT_MAX = 6400;

// Export presets → long-edge pixels (the short edge follows the mosaic aspect).
const EXPORT_PX: Record<ExportSize, number> = {
  Web: 2048,
  Print: 4096,
  Large: 8192,
  Max: 16384, // cells ≈ card native size, so originals aren't downscaled
};

const STRIP_GRADS = [
  "linear-gradient(135deg,#cfd6f2,#e9d2e6)",
  "linear-gradient(135deg,#d6ecd4,#cfe0f2)",
  "linear-gradient(135deg,#f2e0cf,#e7d2f0)",
  "linear-gradient(135deg,#cfe8ec,#dfe0f2)",
  "linear-gradient(135deg,#e8d6e0,#d4d8f0)",
  "linear-gradient(135deg,#dde8cf,#f0e2cf)",
];

const fmt = (x: number) => Math.round(x).toLocaleString("en-US");
const clampPct = (x: number) => Math.max(0, Math.min(100, x));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

const styleStr = (o: Record<string, string | number>) =>
  Object.entries(o)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");

export interface Cell {
  style: string;
}

/**
 * Grid + export dimensions. `srcAR` is the source image's width/height; the grid
 * is laid out so across×down ≈ tileCount tiles, each of shape tileRatioW:H, and
 * the whole mosaic matches the source aspect.
 */
export function gridDims(s: StudioState, srcAR: number) {
  const tileAR = (s.tileRatioW > 0 ? s.tileRatioW : 1) / (s.tileRatioH > 0 ? s.tileRatioH : 1);
  const N = Math.max(4, Math.min(40000, Math.round(s.tileCount)));
  const across = Math.max(1, Math.round(Math.sqrt((N * srcAR) / tileAR)));
  const down = Math.max(1, Math.round(N / across));
  const total = across * down;
  const aspect = (across * tileAR) / down; // mosaic width / height
  const longEdge = EXPORT_PX[s.exportSize] ?? EXPORT_PX.Print;
  let pxW: number, pxH: number;
  if (aspect >= 1) {
    pxW = longEdge;
    pxH = Math.round(longEdge / aspect);
  } else {
    pxH = longEdge;
    pxW = Math.round(longEdge * aspect);
  }
  return { across, down, total, pxW, pxH, tileAR, aspect };
}

export function derive(s: StudioState, srcAR: number) {
  const colorMatch = clampPct(s.colorMatch);
  const minDistance = Math.max(0, Math.min(30, s.minDistance));
  const buildPercent = clampPct(s.buildPercent);
  const includeSubfolders = s.includeSubfolders;

  const { across, down, total, pxW, pxH } = gridDims(s, srcAR);
  const placed = Math.round((total * buildPercent) / 100);

  // library browser thumbnails (placeholder until a real library is loaded)
  const strip: Cell[] = [];
  for (let i = 0; i < 22; i++) {
    strip.push({
      style: styleStr({
        width: "52px",
        height: "52px",
        flexShrink: 0,
        borderRadius: "10px",
        background: STRIP_GRADS[(i * 5) % STRIP_GRADS.length],
        boxShadow: "0 2px 6px -3px rgba(28,26,60,0.3)",
      }),
    });
  }

  // live tile mockup (object-fit: cover demo — scale to fill, center-crop)
  const rW = s.tileRatioW > 0 ? s.tileRatioW : 1;
  const rH = s.tileRatioH > 0 ? s.tileRatioH : 1;
  const maxDim = Math.max(rW, rH);
  const base = 78;
  const tpW = Math.max(20, Math.round((base * rW) / maxDim));
  const tpH = Math.max(20, Math.round((base * rH) / maxDim));
  const inner = Math.round(Math.max(tpW, tpH) * 1.5);
  const tilePreviewFrame = styleStr({
    position: "relative",
    width: tpW + "px",
    height: tpH + "px",
    borderRadius: "8px",
    overflow: "hidden",
    border: "2px solid #15151A",
    boxShadow: "0 4px 10px -4px rgba(28,26,60,0.3)",
  });
  const tilePhotoStyle = styleStr({
    position: "absolute",
    left: "50%",
    top: "50%",
    width: inner + "px",
    height: inner + "px",
    transform: "translate(-50%,-50%)",
    background: "linear-gradient(135deg,#9fb4f0 0%,#e6b8d6 48%,#cdeeb0 100%)",
  });

  const g = gcd(rW, rH) || 1;
  const ratioTxt = rW / g + " : " + rH / g;

  const progA = styleStr({
    width: buildPercent + "%",
    height: "100%",
    background: "#D8FF3E",
    borderRadius: "999px",
  });

  const statusLabel =
    buildPercent >= 100
      ? "Mosaic complete"
      : buildPercent <= 0
        ? "Ready to build"
        : "Building mosaic";
  const photoCount = includeSubfolders ? "2,304" : "612";
  const subfolderTxt = includeSubfolders ? "incl. subfolders" : "top folder only";

  return {
    photoCount,
    subfolderTxt,
    across,
    down,
    totalFmt: fmt(total),
    placedFmt: fmt(placed),
    exportSize: s.exportSize,
    exportDims: fmt(pxW) + " × " + fmt(pxH) + " px",
    colorMatchTxt: colorMatch + "%",
    minDistTxt: minDistance + " tiles",
    gridTxt: across + " × " + down,
    ratioTxt,
    tilePreviewFrame,
    tilePhotoStyle,
    statusLabel,
    strip,
    progA,
  };
}
