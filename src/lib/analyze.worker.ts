// Off-main-thread photo analysis. For each image it builds a tile bitmap (for
// rendering) and a REGIONS×REGIONS Lab signature (for matching). Near-blank /
// pure-white scans are skipped. Bitmaps + signature buffers transfer back
// zero-copy so the UI never freezes, even for a few thousand photos.

import { REGIONS, sigFromRegions } from "./color";

const TILE_BOX = 128; // display tile bitmap (longest side)
const boxCanvas = new OffscreenCanvas(TILE_BOX, TILE_BOX);
const bctx = boxCanvas.getContext("2d")!;
const sigCanvas = new OffscreenCanvas(REGIONS, REGIONS);
const sctx = sigCanvas.getContext("2d", { willReadFrequently: true })!;

interface InItem {
  blob: Blob;
  top: boolean;
}

function minLightness(sig: Float32Array): number {
  let m = Infinity;
  for (let k = 0; k < REGIONS * REGIONS; k++) if (sig[k * 3] < m) m = sig[k * 3];
  return m;
}

self.onmessage = async (e: MessageEvent<{ items: InItem[] }>) => {
  const { items } = e.data;
  const total = items.length;
  let batch: Array<{ index: number; sig: Float32Array; bitmap: ImageBitmap; thumb: Blob }> = [];
  let transfer: Transferable[] = [];

  const flush = (done: number) => {
    (self as unknown as Worker).postMessage({ type: "batch", photos: batch, done, total }, transfer);
    batch = [];
    transfer = [];
  };

  for (let i = 0; i < total; i++) {
    try {
      const full = await createImageBitmap(items[i].blob);
      // signature first, so we can cheaply skip blank scans
      sctx.clearRect(0, 0, REGIONS, REGIONS);
      sctx.drawImage(full, 0, 0, REGIONS, REGIONS);
      const sig = sigFromRegions(sctx.getImageData(0, 0, REGIONS, REGIONS).data);
      if (minLightness(sig) > 92) {
        full.close(); // near-pure-white blank scan — skip
      } else {
        const scale = Math.min(1, TILE_BOX / Math.max(full.width, full.height));
        const w = Math.max(1, Math.round(full.width * scale));
        const h = Math.max(1, Math.round(full.height * scale));
        boxCanvas.width = w;
        boxCanvas.height = h;
        bctx.clearRect(0, 0, w, h);
        bctx.drawImage(full, 0, 0, w, h);
        const bitmap = await createImageBitmap(boxCanvas);
        const thumb = await boxCanvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
        full.close();
        batch.push({ index: i, sig, bitmap, thumb });
        transfer.push(bitmap, sig.buffer);
      }
    } catch {
      // unreadable file — skip, keep going
    }
    if (batch.length >= 40 || i === total - 1) flush(i + 1);
  }

  (self as unknown as Worker).postMessage({ type: "done" });
};
