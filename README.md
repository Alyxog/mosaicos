# Mosaicos

A macOS photo-mosaic studio. Give it a source image and a folder of photos
(hundreds or thousands); it analyzes every photo and rebuilds your image out of
them, one photo per tile.

Built with **Tauri + Svelte 5 + TypeScript**. Native macOS app — no Electron,
no bundled browser (it uses the system WebView), so it's small and fast.

![Mosaicos](src-tauri/icons/128x128@2x.png)

## Features

- **Pick a source image + a photo folder** (with subfolders) via native dialogs.
- **Smart matching** — each photo and each tile is reduced to a 4×4 grid of
  perceptual **CIE-Lab** colors, so matches reflect both color *and* structure.
  The most distinctive tiles are assigned first for the best likeness.
- **Tile ratio** (e.g. `3:5`, `1:1`) defines the tile shape; the grid follows
  your **source image's aspect ratio** and updates live.
- **Photo reuse** — Unique-only or Allow-repeats, with min-distance-between-repeats
  and a max-uses-per-card cap.
- **`object-fit: cover` tiles** — each photo scales to fill its tile and
  center-crops the overflow, never stretched.
- **Off-main-thread analysis** (Web Worker) — thousands of photos won't freeze
  the UI. Blank/near-white scans are skipped automatically.
- **Live preview** with pan, scroll-to-zoom, and a tile-grid overlay.
- **High-res PNG export** drawn from your original full-resolution photos, saved
  via a native dialog, with a one-click "reveal in Finder".
- **Persistence** — your source image + analyzed library are cached locally and
  restored on the next launch.

## Install

### Download (easiest)

Grab the latest `.dmg` from the [Releases](../../releases) page, open it, and drag
**Mosaicos** to your Applications folder.

> **One-time step on first launch.** This build isn't signed/notarized by Apple
> ($99/yr developer program), so macOS quarantines it on download and may say
> *"Mosaicos is damaged and can't be opened."* It isn't damaged — that's just
> Gatekeeper. Remove the quarantine flag once, in **Terminal**:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/Mosaicos.app
> ```
>
> Then open it normally. (Prefer to trust nothing? Build it yourself below — a
> locally-built app is never quarantined.)

### Build from source

Requires [Node.js](https://nodejs.org), and [rustup](https://rustup.rs) (the app
pins a specific Rust toolchain — see the note below).

```bash
git clone https://github.com/<you>/mosaicos.git
cd mosaicos
npm install
npm run tauri build      # produces a .app and .dmg in src-tauri/target/release/bundle/
```

To run it in development:

```bash
npm run tauri dev
```

## Development

```bash
npm install
npm run dev        # frontend only, in the browser at http://localhost:1420
npm run check      # svelte-check (type checking)
npm run tauri dev  # full native app
```

Code map:

- [`src/lib/engine.svelte.ts`](src/lib/engine.svelte.ts) — analysis, matching,
  cover-render, high-res export.
- [`src/lib/analyze.worker.ts`](src/lib/analyze.worker.ts) — off-thread photo analysis.
- [`src/lib/color.ts`](src/lib/color.ts) — RGB→Lab + 4×4 signatures.
- [`src/lib/mosaic.svelte.ts`](src/lib/mosaic.svelte.ts) — reactive plan.
- [`src/lib/Canvas.svelte`](src/lib/Canvas.svelte) — preview rendering, pan/zoom.

### Rust toolchain note

`src-tauri/rust-toolchain.toml` pins **Rust 1.87.0** via rustup, and `Cargo.lock`
pins `time 0.3.41` / `plist 1.7.2` / `serde_with 3.12`. This sidesteps a `time`
crate bug (`error[E0119]`) that bites rustc ≥ 1.88. Don't bump these without
re-testing. If you only have Homebrew Rust, install rustup — the toolchain file
selects the right version automatically.

## Tech

Tauri 2 (Rust) · Svelte 5 (runes) · Vite · TypeScript · Canvas 2D · Web Workers ·
IndexedDB.

## License

[MIT](LICENSE) © Alexy Goguet
