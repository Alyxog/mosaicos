<script lang="ts">
  import { state, type derive } from "./studio.svelte";
  import { engine, loadSource, loadLibrary, includedLibrary } from "./engine.svelte";
  import { pickSource, pickLibrary } from "./io";

  let { d }: { d: ReturnType<typeof derive> } = $props();

  const hasLib = $derived(engine.library.length > 0);
  const includedCount = $derived(includedLibrary(state.includeSubfolders).length);
  const topCount = $derived(engine.library.filter((p) => p.top).length);
  const subCount = $derived(engine.library.length - topCount);
  const fmt = (n: number) => n.toLocaleString("en-US");

  async function chooseSource() {
    const picked = await pickSource();
    if (picked) await loadSource(picked.blob, picked.name);
  }
  async function chooseLibrary() {
    const picked = await pickLibrary();
    if (picked) await loadLibrary(picked.items, picked.rootName);
  }
</script>

<div class="panel">
  <!-- SOURCE IMAGE -->
  <div>
    <div class="eyebrow">SOURCE IMAGE</div>
    <button
      class="dropzone {engine.sourceUrl ? 'has-image' : ''}"
      style={engine.sourceUrl ? `background-image:url(${engine.sourceUrl})` : ""}
      onclick={chooseSource}
    >
      {#if !engine.sourceUrl}
        <div class="drop-icon">↑</div>
        <div class="mono drop-hint">drop or choose image</div>
      {/if}
    </button>
    <div class="source-meta mono">
      <span>{engine.sourceName || "no image selected"}</span>
      <button class="link plain" onclick={chooseSource}>Replace</button>
    </div>
  </div>

  <!-- PHOTO LIBRARY -->
  <div class="library-card">
    <div class="eyebrow">PHOTO LIBRARY</div>
    <div class="folder-row">
      <div class="folder-path mono">{engine.libraryPath || "~/Pictures/MyLibrary"}</div>
      <button class="link choose plain" onclick={chooseLibrary}>Choose</button>
    </div>

    <!-- include subfolders toggle -->
    <button
      class="subfolder {state.includeSubfolders ? 'on' : 'off'}"
      onclick={() => (state.includeSubfolders = !state.includeSubfolders)}
    >
      <div class="subfolder-text">
        <div class="subfolder-title">Include subfolders</div>
        <div class="mono subfolder-sub">
          {#if hasLib}
            {state.includeSubfolders ? `${fmt(subCount)} photos in subfolders` : "top-level folder only"}
          {:else}
            {state.includeSubfolders ? "scans nested folders too" : "top-level folder only"}
          {/if}
        </div>
      </div>
      <div class="switch">
        <div class="knob"></div>
      </div>
    </button>

    <div class="count-row">
      <div class="count-badge"><span>{engine.scanning ? "…" : "✓"}</span></div>
      <div>
        {#if engine.scanning}
          <div class="count-num">{fmt(engine.scanned)}</div>
          <div class="mono count-label">analyzing… of {fmt(engine.scanTotal)}</div>
        {:else}
          <div class="count-num">{hasLib ? fmt(includedCount) : d.photoCount}</div>
          <div class="mono count-label">photos found &amp; analyzed</div>
        {/if}
      </div>
    </div>
    <button class="mono rescan plain" onclick={chooseLibrary}>↻ Re-scan folder</button>
  </div>
</div>

<style>
  .panel {
    width: 292px;
    border-right: 1px solid #eeedf4;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #f8f8fc;
    overflow: auto;
  }
  .mono {
    font-family: "Space Mono", monospace;
  }
  .plain {
    border: none;
    background: none;
    font-family: inherit;
    padding: 0;
    cursor: pointer;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.13em;
    color: #9a9aa8;
    font-weight: 600;
    margin-bottom: 9px;
  }
  .link {
    color: #5b4dff;
    cursor: pointer;
  }
  .dropzone {
    width: 100%;
    height: 210px;
    border: 1.5px dashed #c9c8da;
    border-radius: 14px;
    background: linear-gradient(135deg, #f3f2fb, #eeedf8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #9a9aa8;
    text-align: center;
    cursor: pointer;
  }
  .dropzone.has-image {
    border-style: solid;
    border-color: #dcd7ff;
    background-size: cover;
    background-position: center;
  }
  .drop-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #e4e3ee;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #5b4dff;
  }
  .drop-hint {
    font-size: 10.5px;
  }
  .source-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 9px;
    font-size: 11px;
    color: #7a7a8a;
  }
  .source-meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .library-card {
    border: 1px solid #ecebf4;
    border-radius: 16px;
    background: #fff;
    padding: 16px;
    box-shadow: 0 6px 18px -10px rgba(28, 26, 60, 0.16);
  }
  .library-card .eyebrow {
    margin-bottom: 11px;
  }
  .folder-row {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 13px;
  }
  .folder-path {
    flex: 1;
    font-size: 11px;
    color: #6a6a7a;
    background: #f4f3fa;
    border-radius: 9px;
    padding: 7px 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .choose {
    font-size: 13px;
    white-space: nowrap;
  }
  .subfolder {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 13px;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .subfolder.on {
    background: #f1efff;
    border: 1px solid #dcd7ff;
  }
  .subfolder.off {
    background: #f6f6fa;
    border: 1px solid #e8e7f0;
  }
  .subfolder-title {
    font-size: 14px;
    font-weight: 500;
  }
  .subfolder-sub {
    font-size: 10px;
    margin-top: 1px;
  }
  .subfolder.on .subfolder-sub {
    color: #8a86b0;
  }
  .subfolder.off .subfolder-sub {
    color: #a0a0ae;
  }
  .switch {
    width: 46px;
    height: 26px;
    border-radius: 999px;
    position: relative;
    flex-shrink: 0;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
    transition: background 0.18s ease;
  }
  .subfolder.on .switch {
    background: #5b4dff;
  }
  .subfolder.off .switch {
    background: #d8d8e2;
  }
  .switch .knob {
    position: absolute;
    top: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.26);
    transition: left 0.18s ease;
  }
  .subfolder.on .switch .knob {
    left: 23px;
  }
  .subfolder.off .switch .knob {
    left: 3px;
  }
  .count-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .count-badge {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: #15151a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .count-badge span {
    color: #d8ff3e;
    font-size: 22px;
    font-weight: 700;
  }
  .count-num {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .count-label {
    font-size: 10px;
    color: #9a9aa8;
    margin-top: 3px;
  }
  .rescan {
    margin-top: 13px;
    font-size: 11px;
    color: #5b4dff;
    cursor: pointer;
  }
</style>
