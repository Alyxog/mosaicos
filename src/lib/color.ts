// Perceptual color signatures for mosaic matching.
//
// Each photo and each source tile is reduced to a REGIONS×REGIONS grid of
// average colors, converted to CIE-Lab (perceptually uniform) so that
// nearest-signature matching reflects how *similar they look*, and captures
// spatial structure (a face's light top / dark bottom), not just one average.

export const REGIONS = 4; // 4×4 sub-regions per tile
export const STRIDE = REGIONS * REGIONS * 3; // Lab triplets, flattened

/** sRGB (0–255) → CIE-Lab. */
export function rgb2lab(r: number, g: number, b: number): [number, number, number] {
  let R = r / 255,
    G = g / 255,
    B = b / 255;
  const inv = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
  R = inv(R);
  G = inv(G);
  B = inv(B);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Pack the RGBA pixels of a REGIONS×REGIONS image into a flat Lab signature. */
export function sigFromRegions(data: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(STRIDE);
  for (let k = 0; k < REGIONS * REGIONS; k++) {
    const o = k * 4;
    const [L, a, b] = rgb2lab(data[o], data[o + 1], data[o + 2]);
    out[k * 3] = L;
    out[k * 3 + 1] = a;
    out[k * 3 + 2] = b;
  }
  return out;
}
