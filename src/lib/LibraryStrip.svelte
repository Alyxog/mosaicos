<script lang="ts">
  import { state, type derive } from "./studio.svelte";
  import { engine, includedLibrary } from "./engine.svelte";

  let { d }: { d: ReturnType<typeof derive> } = $props();

  const included = $derived(includedLibrary(state.includeSubfolders));
  const hasLib = $derived(included.length > 0);
  const fmt = (n: number) => n.toLocaleString("en-US");
</script>

<div class="strip-wrap">
  <div class="head">
    <span class="label">Photo library</span>
    <span class="mono meta">
      {#if hasLib}
        scroll to browse · {fmt(included.length)} photos · {d.subfolderTxt}
      {:else}
        scroll to browse · {d.photoCount} photos · {d.subfolderTxt}
      {/if}
    </span>
  </div>
  <div class="strip">
    {#if hasLib}
      {#each included as t (t.url)}
        <img class="thumb" src={t.url} loading="lazy" decoding="async" alt="" />
      {/each}
    {:else}
      {#each d.strip as t}
        <div style={t.style}></div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .strip-wrap {
    border-top: 1px solid #eeedf4;
    background: #f4f3fa;
    padding: 13px 18px;
  }
  .mono {
    font-family: "Space Mono", monospace;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 9px;
  }
  .label {
    font-size: 14px;
    font-weight: 500;
  }
  .meta {
    font-size: 11px;
    color: #9a9aa8;
  }
  .strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }
  .thumb {
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    border-radius: 10px;
    object-fit: cover;
    display: block;
    background: #ecebf4;
    box-shadow: 0 2px 6px -3px rgba(28, 26, 60, 0.3);
  }
</style>
