<script lang="ts">
  import { onMount } from "svelte";
  import { state, derive } from "./lib/studio.svelte";
  import { sourceAspect, restore } from "./lib/engine.svelte";
  import LeftPanel from "./lib/LeftPanel.svelte";
  import Canvas from "./lib/Canvas.svelte";
  import Inspector from "./lib/Inspector.svelte";
  import LibraryStrip from "./lib/LibraryStrip.svelte";
  import StatusBar from "./lib/StatusBar.svelte";

  const d = $derived(derive(state, sourceAspect()));

  onMount(() => {
    restore(); // bring back the source + library from the last session
  });
</script>

<div class="app">
  <div class="main">
    <LeftPanel {d} />
    <Canvas />
    <Inspector {d} />
  </div>
  <LibraryStrip {d} />
  <StatusBar {d} />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: #fff;
  }
  .main {
    flex: 1;
    min-height: 0;
    display: flex;
  }
</style>
