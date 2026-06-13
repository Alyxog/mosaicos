<script lang="ts">
  import {
    state,
    type derive,
    type ExportSize,
    TILE_COUNT_MIN,
    TILE_COUNT_MAX,
  } from "./studio.svelte";
  import Slider from "./Slider.svelte";

  let { d }: { d: ReturnType<typeof derive> } = $props();

  const clampRatio = (n: number) => Math.max(1, Math.min(32, Math.round(n || 1)));

  const PRESETS: [number, number][] = [
    [1, 1],
    [3, 2],
    [4, 3],
    [16, 9],
    [9, 5],
    [3, 5],
    [2, 3],
  ];
  const isActive = (w: number, h: number) => state.tileRatioW === w && state.tileRatioH === h;

  function setCount(pct: number) {
    state.tileCount = Math.round(TILE_COUNT_MIN + (pct / 100) * (TILE_COUNT_MAX - TILE_COUNT_MIN));
  }
  const countPct = $derived(
    ((state.tileCount - TILE_COUNT_MIN) / (TILE_COUNT_MAX - TILE_COUNT_MIN)) * 100,
  );

  function setMinDistance(pct: number) {
    state.minDistance = Math.round((pct / 100) * 30);
  }
  // max uses: 1..12, where 12 = unlimited (stored as 0)
  function setMaxUses(pct: number) {
    const v = Math.round(1 + (pct / 100) * 11);
    state.maxUses = v >= 12 ? 0 : v;
  }
  const maxUsesPct = $derived((((state.maxUses === 0 ? 12 : state.maxUses) - 1) / 11) * 100);
  const maxUsesTxt = $derived(state.maxUses === 0 ? "∞" : `${state.maxUses}×`);
  function setColorMatch(pct: number) {
    state.colorMatch = Math.round(pct);
  }

  const EXPORTS: ExportSize[] = ["Web", "Print", "Large", "Max"];
</script>

<div class="inspector">
  <div class="title">Settings</div>

  <!-- TILE RATIO + live mockup -->
  <div>
    <div class="eyebrow">TILE RATIO</div>
    <div class="tile-row">
      <div class="tile-fields">
        <div class="dims">
          <input
            class="dim mono"
            type="number"
            min="1"
            max="32"
            value={state.tileRatioW}
            oninput={(e) => (state.tileRatioW = clampRatio(+e.currentTarget.value))}
          />
          <span class="times">:</span>
          <input
            class="dim mono"
            type="number"
            min="1"
            max="32"
            value={state.tileRatioH}
            oninput={(e) => (state.tileRatioH = clampRatio(+e.currentTarget.value))}
          />
          <div class="ratio mono">= <span class="ratio-val">{d.ratioTxt}</span></div>
        </div>
        <div class="presets">
          {#each PRESETS as [w, h]}
            <button
              class="chip mono {isActive(w, h) ? 'on' : ''}"
              onclick={() => {
                state.tileRatioW = w;
                state.tileRatioH = h;
              }}>{w}:{h}</button
            >
          {/each}
        </div>
      </div>
      <!-- live tile mockup: object-fit cover (fill + center-crop, never stretch) -->
      <div class="mockup-wrap">
        <div class="mockup-frame">
          <div style={d.tilePreviewFrame}>
            <div style={d.tilePhotoStyle}></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- TILE COUNT -->
  <div>
    <div class="row-head">
      <span class="eyebrow inline">TILE COUNT</span>
      <span class="mono val">{d.gridTxt} · {d.totalFmt} tiles</span>
    </div>
    <Slider pct={countPct} oninput={setCount} />
    <div class="endcaps mono"><span>fewer</span><span>more</span></div>
  </div>

  <!-- PHOTO REUSE -->
  <div>
    <div class="eyebrow">PHOTO REUSE</div>
    <div class="reuse">
      <button
        class="reuse-opt {state.reuseMode === 'Allow repeats' ? 'active' : ''}"
        onclick={() => (state.reuseMode = "Allow repeats")}>Allow repeats</button
      >
      <button
        class="reuse-opt {state.reuseMode === 'Unique only' ? 'active' : ''}"
        onclick={() => (state.reuseMode = "Unique only")}>Unique only</button
      >
    </div>
    {#if state.reuseMode === "Allow repeats"}
      <div class="row-head tight">
        <span class="mono sub">min distance between repeats</span>
        <span class="mono val">{d.minDistTxt}</span>
      </div>
      <Slider pct={(state.minDistance / 30) * 100} oninput={setMinDistance} />

      <div class="row-head tight" style="margin-top:12px;">
        <span class="mono sub">max uses per card</span>
        <span class="mono val">{maxUsesTxt}</span>
      </div>
      <Slider pct={maxUsesPct} oninput={setMaxUses} />
    {/if}
  </div>

  <!-- COLOR MATCH -->
  <div>
    <div class="row-head">
      <span class="eyebrow inline">COLOR MATCH</span>
      <span class="mono val">{d.colorMatchTxt}</span>
    </div>
    <Slider pct={state.colorMatch} oninput={setColorMatch} />
    <div class="endcaps mono"><span>true photos</span><span>tinted to source</span></div>
  </div>

  <!-- OUTPUT -->
  <div>
    <div class="eyebrow">OUTPUT</div>
    <div class="reuse">
      {#each EXPORTS as opt}
        <button
          class="reuse-opt {state.exportSize === opt ? 'active' : ''}"
          onclick={() => (state.exportSize = opt)}>{opt}</button
        >
      {/each}
    </div>
    <div class="mono dpi">{d.exportDims}</div>
  </div>
</div>

<style>
  .inspector {
    width: 344px;
    border-left: 1px solid #eeedf4;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    background: #f8f8fc;
    overflow: auto;
  }
  .mono {
    font-family: "Space Mono", monospace;
  }
  .title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.13em;
    color: #9a9aa8;
    font-weight: 600;
    margin-bottom: 11px;
  }
  .eyebrow.inline {
    margin-bottom: 0;
  }
  .row-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .row-head.tight {
    margin-bottom: 6px;
  }
  .val {
    font-size: 12px;
    color: #5a5a6a;
  }
  .sub {
    font-size: 11px;
    color: #9a9aa8;
  }
  /* tile ratio */
  .tile-row {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .tile-fields {
    flex: 1;
    min-width: 0;
  }
  .dims {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .dim {
    border: 1px solid #e2e1ec;
    border-radius: 10px;
    padding: 8px 0;
    font-size: 15px;
    background: #fff;
    width: 46px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(28, 26, 60, 0.05);
    color: #15151a;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .dim::-webkit-outer-spin-button,
  .dim::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .dim:focus {
    outline: none;
    border-color: #5b4dff;
  }
  .times {
    font-size: 16px;
    color: #c0c0cc;
  }
  .ratio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #6a6a7a;
    margin-left: 2px;
  }
  .ratio-val {
    color: #5b4dff;
    font-weight: 700;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .chip {
    font-size: 11px;
    color: #6a6a7a;
    background: #fff;
    border: 1px solid #ecebf4;
    border-radius: 8px;
    padding: 4px 9px;
    cursor: pointer;
  }
  .chip.on {
    background: #f1efff;
    border-color: #c9c1ff;
    color: #5b4dff;
    font-weight: 700;
  }
  .mockup-wrap {
    width: 112px;
    flex-shrink: 0;
    text-align: center;
  }
  .mockup-frame {
    height: 112px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border: 1px solid #ecebf4;
    border-radius: 14px;
    box-shadow: 0 6px 16px -10px rgba(28, 26, 60, 0.2);
  }
  /* segmented (reuse + output) */
  .reuse {
    display: flex;
    background: #ededf4;
    border-radius: 11px;
    padding: 3px;
    margin-bottom: 13px;
  }
  .reuse-opt {
    flex: 1;
    text-align: center;
    padding: 8px;
    border-radius: 8px;
    font-size: 13px;
    color: #8a8a99;
    cursor: pointer;
    border: none;
    background: transparent;
    font-family: inherit;
    white-space: nowrap;
  }
  .reuse-opt.active {
    background: #fff;
    color: #15151a;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(28, 26, 60, 0.14);
  }
  .endcaps {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #a0a0ae;
    margin-top: 5px;
  }
  .dpi {
    font-size: 11px;
    color: #9a9aa8;
    margin-top: 7px;
  }
</style>
