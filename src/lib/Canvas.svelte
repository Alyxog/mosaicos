<script lang="ts">
  import { onMount } from "svelte";
  import { state as studio } from "./studio.svelte";
  import { engine, renderMosaic, sourceAspect } from "./engine.svelte";
  import { mosaic } from "./mosaic.svelte";

  let view = $state<"mosaic" | "source">("mosaic");
  let showGrid = $state(false);
  let frameEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let frameW = $state(0);
  let frameH = $state(0);

  // pan/zoom (in device pixels; zoom is a multiplier, 1 = fit)
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  const dpr = () => window.devicePixelRatio || 1;

  const TONES = ["#C5C5D2", "#B2B2C2", "#A4A4B6", "#CECEDA", "#BABACA", "#9C9CAE"];

  onMount(() => {
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      frameW = r.width;
      frameH = r.height;
    });
    ro.observe(frameEl);
    return () => ro.disconnect();
  });

  // reset the view when a new source image loads
  let lastSrc = "";
  $effect(() => {
    if (engine.sourceUrl !== lastSrc) {
      lastSrc = engine.sourceUrl;
      zoom = 1;
      panX = 0;
      panY = 0;
    }
  });

  function ensureCanvas(): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
    if (!canvasEl || frameW === 0 || frameH === 0) return null;
    const d = dpr();
    const w = Math.round(frameW * d);
    const h = Math.round(frameH * d);
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
    const ctx = canvasEl.getContext("2d");
    return ctx ? { ctx, w, h } : null;
  }

  // Box (in device px) that holds the image/mosaic, at the SOURCE aspect so the
  // Source and Mosaic views occupy the identical rectangle.
  function box(w: number, h: number) {
    const aspect = engine.source ? sourceAspect() : mosaic.dims.aspect;
    const pad = Math.round(Math.min(w, h) * 0.03);
    const aw = w - pad * 2,
      ah = h - pad * 2;
    let bw: number, bh: number;
    if (aw / ah > aspect) {
      bh = ah;
      bw = ah * aspect;
    } else {
      bw = aw;
      bh = aw / aspect;
    }
    return { bw, bh, ox: (w - bw) / 2, oy: (h - bh) / 2 };
  }

  function drawMockGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cols = 30,
      rows = 16,
      n = cols * rows;
    const cw = w / cols,
      ch = h / rows;
    ctx.fillStyle = "#E6E6EE";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x = (i % cols) * cw,
        y = Math.floor(i / cols) * ch;
      ctx.fillStyle = TONES[(i * 7) % TONES.length];
      ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    }
  }

  function draw() {
    const fit = ensureCanvas();
    if (!fit) return;
    const { ctx, w, h } = fit;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high"; // sharper small tiles in the preview
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!engine.source) {
      drawMockGrid(ctx, w, h);
      return;
    }

    // apply pan/zoom for everything image-related
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
    const { bw, bh, ox, oy } = box(w, h);

    if (view === "source") {
      const src = engine.source;
      ctx.fillStyle = "#fff";
      ctx.fillRect(ox, oy, bw, bh);
      ctx.drawImage(src, ox, oy, bw, bh); // box == source aspect → no distortion
      return;
    }

    const { across, down, total } = mosaic.dims;
    const cellW = bw / across,
      cellH = bh / down;

    if (!mosaic.ready) {
      ctx.fillStyle = "#E6E6EE";
      ctx.fillRect(ox, oy, bw, bh);
      if (total <= 5000) {
        ctx.fillStyle = "#FFFFFF";
        for (let y = 0; y < down; y++)
          for (let x = 0; x < across; x++)
            ctx.fillRect(ox + x * cellW + 0.5, oy + y * cellH + 0.5, cellW - 1, cellH - 1);
      } else {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(ox + 1, oy + 1, bw - 2, bh - 2);
      }
      return;
    }

    // Blit the pre-composited mosaic as ONE image (4-arg drawImage — no source
    // rect, so no ~1:1 WebKit drop). A single image can't have per-tile gaps.
    if (mosaicLayer.width > 0) {
      ctx.drawImage(mosaicLayer, ox, oy, bw, bh);
    }

    if (showGrid && across <= 200 && down <= 200) {
      ctx.strokeStyle = "rgba(91,77,255,0.85)"; // indigo, reads over any photo
      ctx.lineWidth = (1.5 * dpr()) / zoom;
      ctx.beginPath();
      for (let i = 0; i <= across; i++) {
        const px = ox + i * cellW;
        ctx.moveTo(px, oy);
        ctx.lineTo(px, oy + cellH * down);
      }
      for (let j = 0; j <= down; j++) {
        const py = oy + j * cellH;
        ctx.moveTo(ox, py);
        ctx.lineTo(ox + cellW * across, py);
      }
      ctx.stroke();
    }
  }

  // The mosaic is composited once onto a detached canvas (reliable — the same
  // way the high-res export draws, which is correct). The on-screen preview only
  // ever blits this single image.
  const mosaicLayer = document.createElement("canvas");
  function buildMosaicLayer() {
    if (!mosaic.ready) {
      mosaicLayer.width = 0;
      return;
    }
    const { across, down, tileAR } = mosaic.dims;
    const cph = 128;
    const cpw = Math.max(1, Math.round(cph * tileAR));
    mosaicLayer.width = across * cpw;
    mosaicLayer.height = down * cph;
    const mctx = mosaicLayer.getContext("2d");
    if (!mctx) return;
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    renderMosaic({
      ctx: mctx,
      canvasW: mosaicLayer.width,
      canvasH: mosaicLayer.height,
      originX: 0,
      originY: 0,
      cellW: cpw,
      cellH: cph,
      tileRgb: mosaic.sourceSig.rgb,
      plan: mosaic.plan,
      lib: mosaic.lib,
      across,
      down,
      placed: across * down,
      colorMatch: studio.colorMatch,
      leadingEdge: false,
    });
  }

  // Rebuild the mosaic layer only when its contents change (cheap to blit after).
  $effect(() => {
    void mosaic.plan;
    void mosaic.lib;
    void mosaic.dims;
    void mosaic.sourceSig;
    void studio.colorMatch;
    buildMosaicLayer();
    draw();
  });

  // Redraw (blit) on interactive changes — pan, zoom, view, window size.
  $effect(() => {
    draw();
  });

  // ---- interaction ----
  function applyZoom(factor: number, cx: number, cy: number) {
    const nz = Math.max(1, Math.min(24, zoom * factor));
    const f = nz / zoom;
    panX = cx - (cx - panX) * f;
    panY = cy - (cy - panY) * f;
    zoom = nz;
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    }
  }
  function onWheel(e: WheelEvent) {
    if (!engine.source) return;
    e.preventDefault();
    const r = canvasEl.getBoundingClientRect();
    const cx = (e.clientX - r.left) * dpr();
    const cy = (e.clientY - r.top) * dpr();
    applyZoom(Math.exp(-e.deltaY * 0.0015), cx, cy);
  }
  function zoomButton(factor: number) {
    applyZoom(factor, canvasEl.width / 2, canvasEl.height / 2);
  }
  function fit() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  let dragging = $state(false);
  let lastX = 0,
    lastY = 0;
  function onPointerDown(e: PointerEvent) {
    if (!engine.source) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvasEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    panX += (e.clientX - lastX) * dpr();
    panY += (e.clientY - lastY) * dpr();
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    canvasEl.releasePointerCapture(e.pointerId);
  }
</script>

<div class="canvas">
  <div class="toolbar">
    <div class="zoom mono">
      <button class="zbtn" onclick={() => zoomButton(1 / 1.2)}>−</button>
      <span class="zval">{Math.round(zoom * 100)}%</span>
      <button class="zbtn" onclick={() => zoomButton(1.2)}>+</button>
    </div>
    <button class="pill mono" onclick={fit}>Fit</button>
    <div class="segmented">
      <button class="seg {view === 'mosaic' ? 'active' : ''}" onclick={() => (view = "mosaic")}
        >Mosaic</button
      >
      <button class="seg {view === 'source' ? 'active' : ''}" onclick={() => (view = "source")}
        >Source</button
      >
    </div>
    <button
      class="pill mono grid-pill"
      class:grid-on={showGrid}
      onclick={() => (showGrid = !showGrid)}
      title="Toggle tile grid overlay">▦ grid</button
    >
  </div>

  <div class="stage">
    <div class="frame" bind:this={frameEl}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <canvas
        bind:this={canvasEl}
        class="board"
        class:grab={!!engine.source}
        class:grabbing={dragging}
        onwheel={onWheel}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
      ></canvas>
      {#if view === "mosaic" && !engine.source}
        <div class="empty mono">Load a source image to begin</div>
      {:else if view === "mosaic" && !mosaic.ready}
        <div class="empty mono">Choose a photo library to fill the grid</div>
      {/if}
      <div class="hint mono">drag to pan · scroll to zoom into tiles</div>
    </div>
  </div>
</div>

<style>
  .canvas {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #fbfbfe;
  }
  .mono {
    font-family: "Space Mono", monospace;
  }
  .toolbar {
    height: 50px;
    border-bottom: 1px solid #eeedf4;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 16px;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 2px;
    background: #f1f1f7;
    border-radius: 9px;
    padding: 3px 4px;
    font-size: 12px;
    color: #6a6a7a;
  }
  .zbtn {
    padding: 3px 8px;
    cursor: pointer;
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    border-radius: 6px;
  }
  .zbtn:hover {
    background: #e5e5ee;
  }
  .zval {
    padding: 3px 6px;
    color: #15151a;
    min-width: 44px;
    text-align: center;
  }
  .pill {
    font-size: 12px;
    color: #6a6a7a;
    background: #f1f1f7;
    border-radius: 9px;
    padding: 6px 11px;
    cursor: pointer;
    border: none;
    font-family: inherit;
  }
  .segmented {
    display: flex;
    background: #f1f1f7;
    border-radius: 9px;
    padding: 3px;
    margin-left: 4px;
  }
  .seg {
    font-size: 13px;
    padding: 4px 12px;
    border-radius: 7px;
    color: #8a8a99;
    cursor: pointer;
    border: none;
    background: transparent;
    font-family: inherit;
  }
  .seg.active {
    background: #15151a;
    color: #fff;
  }
  .grid-pill {
    margin-left: auto;
  }
  .grid-on {
    background: #15151a;
    color: #fff;
  }
  .stage {
    flex: 1;
    padding: 20px;
    min-height: 0;
    display: flex;
  }
  .frame {
    flex: 1;
    min-height: 0;
    position: relative;
    border: 1px solid #e8e7f0;
    border-radius: 16px;
    overflow: hidden;
    background: #fff;
    box-shadow: inset 0 2px 10px rgba(28, 26, 60, 0.05);
  }
  .board {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .board.grab {
    cursor: grab;
  }
  .board.grabbing {
    cursor: grabbing;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 40px;
    font-size: 12px;
    color: #9a9aa8;
    pointer-events: none;
  }
  .hint {
    position: absolute;
    left: 14px;
    bottom: 14px;
    font-size: 11px;
    color: #5a5a6a;
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(6px);
    border: 1px solid #eaeaf2;
    border-radius: 9px;
    padding: 5px 10px;
    pointer-events: none;
  }
</style>
