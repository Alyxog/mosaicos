<script lang="ts">
  import { state as studio, type derive } from "./studio.svelte";
  import { engine, exportHighRes, lastExportInfo, revealExport } from "./engine.svelte";
  import { mosaic } from "./mosaic.svelte";

  let { d }: { d: ReturnType<typeof derive> } = $props();

  let exporting = $state(false);

  async function onExport() {
    if (!mosaic.ready || exporting) return;
    exporting = true;
    try {
      const base = (engine.sourceName || "mosaic").replace(/\.[^.]+$/, "");
      await exportHighRes({
        pxW: mosaic.dims.pxW,
        pxH: mosaic.dims.pxH,
        tileRgb: mosaic.sourceSig.rgb,
        plan: mosaic.plan,
        lib: mosaic.lib,
        across: mosaic.dims.across,
        down: mosaic.dims.down,
        colorMatch: studio.colorMatch,
        filename: `${base}-mosaic-${studio.exportSize}.png`,
      });
    } finally {
      exporting = false;
    }
  }

  // Real progress: while the library is being analyzed, show that; once the
  // mosaic is ready it renders complete (finishes 100%).
  const scanPct = $derived(
    engine.scanning && engine.scanTotal > 0 ? (engine.scanned / engine.scanTotal) * 100 : 0,
  );
  const fillPct = $derived(engine.scanning ? scanPct : mosaic.ready ? 100 : 0);
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const label = $derived(
    engine.scanning
      ? `Analyzing library · ${fmt(engine.scanned)} / ${fmt(engine.scanTotal)} photos`
      : mosaic.ready
        ? `Mosaic complete · ${d.totalFmt} / ${d.totalFmt} tiles placed`
        : "Ready to build — load a source image and a photo library",
  );
</script>

<div class="status">
  <div class="progress-col">
    <div class="line mono">
      <span class="status-label">{label}</span>
      {#if mosaic.ready}<span class="saving">✓ saved</span>{/if}
    </div>
    <div class="bar">
      <div class="bar-fill" style:width="{fillPct}%"></div>
    </div>
  </div>
  <div class="promise mono">
    {#if lastExportInfo.hiNull >= 0}
      <div class="export-line">
        <span
          >Last export: {lastExportInfo.hiNull === 0
            ? "all originals used ✓"
            : `${lastExportInfo.hiNull} originals failed to load`}</span
        >
        {#if lastExportInfo.path}
          <button class="reveal" onclick={revealExport} title="Show in Finder" aria-label="Show exported file in Finder">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
        {/if}
      </div>
    {:else}
      Thanks for using Mosaicos<br />— enjoy your mosaic! ✨
    {/if}
  </div>
  <button class="export" class:disabled={!mosaic.ready || exporting} onclick={onExport}>
    {exporting ? "Exporting…" : "Export High-Res"}
  </button>
</div>

<style>
  .status {
    border-top: 1px solid #eeedf4;
    background: #fff;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .mono {
    font-family: "Space Mono", monospace;
  }
  .progress-col {
    flex: 1;
    min-width: 0;
  }
  .line {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 7px;
  }
  .status-label {
    color: #3a3a48;
  }
  .saving {
    color: #15151a;
    background: #d8ff3e;
    border-radius: 6px;
    padding: 1px 7px;
  }
  .bar {
    position: relative;
    height: 12px;
    background: #ededf4;
    border-radius: 999px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: #d8ff3e;
    border-radius: 999px;
    transition: width 0.2s ease;
  }
  .promise {
    font-size: 11px;
    color: #5a5a6a;
    max-width: 236px;
    line-height: 1.55;
  }
  .export-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .reveal {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid #e2e1ec;
    border-radius: 8px;
    background: #fff;
    color: #5b4dff;
    cursor: pointer;
    padding: 0;
  }
  .reveal:hover {
    background: #f1efff;
    border-color: #c9c1ff;
  }
  .export {
    padding: 11px 20px;
    border-radius: 12px;
    background: #5b4dff;
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    box-shadow: 0 8px 18px -8px rgba(91, 77, 255, 0.6);
    cursor: pointer;
    border: none;
    font-family: inherit;
  }
  .export.disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }
</style>
