// Reactive mosaic plan, shared across components.
//
// The expensive step (matching every tile to a photo) lives in `plan` and only
// recomputes when its real inputs change — source, library subset, grid size,
// reuse mode, min distance. buildPercent and colorMatch deliberately do NOT
// feed the plan; they only affect rendering, so dragging them stays cheap.
//
// Exposed as a single class instance because Svelte 5 memoizes `$derived`
// class fields but disallows exporting bare `$derived` from a module.

import { state as studio, gridDims } from "./studio.svelte";
import {
  engine,
  includedLibrary,
  analyzeSource,
  buildPlan,
  sourceAspect,
  type LibPhoto,
  type SourceSignature,
} from "./engine.svelte";

const EMPTY_SIG: SourceSignature = { sig: new Float32Array(0), rgb: new Float32Array(0) };

class Mosaic {
  lib = $derived<LibPhoto[]>(includedLibrary(studio.includeSubfolders));
  ready = $derived(engine.source !== null && this.lib.length > 0);
  dims = $derived(gridDims(studio, sourceAspect()));
  sourceSig = $derived<SourceSignature>(
    engine.source ? analyzeSource(engine.source, this.dims.across, this.dims.down) : EMPTY_SIG,
  );
  plan = $derived<Int32Array>(
    this.ready
      ? buildPlan(this.sourceSig, this.lib, this.dims.across, this.dims.down, studio.reuseMode, studio.minDistance, studio.maxUses)
      : new Int32Array(0),
  );
}

export const mosaic = new Mosaic();
