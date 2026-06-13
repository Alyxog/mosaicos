<script lang="ts">
  // A draggable ring-knob slider matching the Studio Fresh design.
  // Parent supplies the display percent (0..100) and receives drag updates;
  // the parent maps percent <-> the real value it backs.
  let { pct, oninput }: { pct: number; oninput: (pct: number) => void } = $props();

  let track: HTMLDivElement;
  let dragging = $state(false);

  function pctFromClientX(clientX: number): number {
    const r = track.getBoundingClientRect();
    if (r.width <= 0) return pct;
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    oninput(pctFromClientX(e.clientX));
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    oninput(pctFromClientX(e.clientX));
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

<div
  bind:this={track}
  class="track"
  role="slider"
  tabindex="0"
  aria-valuenow={Math.round(pct)}
  aria-valuemin="0"
  aria-valuemax="100"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  <div class="rail"></div>
  <div class="fill" style:width="{pct}%"></div>
  <div class="knob" style:left="{pct}%"></div>
</div>

<style>
  .track {
    position: relative;
    height: 20px;
    cursor: pointer;
    touch-action: none;
  }
  .rail {
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 5px;
    background: #e6e6ef;
    border-radius: 999px;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 8px;
    height: 5px;
    background: #5b4dff;
    border-radius: 999px;
  }
  .knob {
    position: absolute;
    top: 50%;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;
    background: #fff;
    border: 4px solid #5b4dff;
    border-radius: 50%;
    box-shadow: 0 2px 6px -1px rgba(28, 26, 60, 0.35);
  }
</style>
