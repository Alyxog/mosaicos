// Environment-agnostic file/folder picking.
//
// In the packaged Tauri app we use native dialogs + the fs plugin (WKWebView
// can't reliably do HTML directory pickers). In the plain browser dev server
// we fall back to <input> elements so `npm run dev` stays fully functional.

import type { RawPhoto } from "./engine.svelte";

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|avif|heic)$/i;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface PickedSource {
  blob: Blob;
  name: string;
}
export interface PickedLibrary {
  items: RawPhoto[];
  rootName: string;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

// ---------- browser fallback ----------

function browserPickSource(): Promise<PickedSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      resolve(f ? { blob: f, name: f.name } : null);
    };
    input.click();
  });
}

function browserPickLibrary(): Promise<PickedLibrary | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    // webkitdirectory lets the browser pick a whole folder tree.
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return resolve(null);
      const rel0 = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const rootName = rel0.split("/")[0] || "Library";
      const items: RawPhoto[] = files
        .filter((f) => IMAGE_RE.test(f.name))
        .map((f) => {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          return { blob: f, name: f.name, top: rel.split("/").length <= 2 };
        });
      resolve({ items, rootName });
    };
    input.click();
  });
}

// ---------- native Tauri ----------

async function tauriPickSource(): Promise<PickedSource | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"] }],
  });
  if (typeof selected !== "string") return null;
  const bytes = await readFile(selected);
  return { blob: new Blob([new Uint8Array(bytes)]), name: basename(selected) };
}

async function tauriPickLibrary(): Promise<PickedLibrary | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const fs = await import("@tauri-apps/plugin-fs");
  const root = await open({ multiple: false, directory: true });
  if (typeof root !== "string") return null;

  const items: RawPhoto[] = [];
  // Recursive walk; depth 0 == directly in the chosen folder (top-level).
  async function walk(dir: string, depth: number): Promise<void> {
    let entries: Awaited<ReturnType<typeof fs.readDir>>;
    try {
      entries = await fs.readDir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory) {
        await walk(full, depth + 1);
      } else if (IMAGE_RE.test(e.name)) {
        try {
          const bytes = await fs.readFile(full);
          items.push({
            blob: new Blob([new Uint8Array(bytes)]),
            name: e.name,
            top: depth === 0,
            path: full,
          });
        } catch {
          // unreadable — skip
        }
      }
    }
  }
  await walk(root, 0);
  return { items, rootName: basename(root) };
}

// ---------- public API ----------

export function pickSource(): Promise<PickedSource | null> {
  return isTauri() ? tauriPickSource() : browserPickSource();
}
export function pickLibrary(): Promise<PickedLibrary | null> {
  return isTauri() ? tauriPickLibrary() : browserPickLibrary();
}

/**
 * Save a generated image. Native: OS save dialog + file write, returns the saved
 * path. Browser: triggers a download, returns null (no reachable path).
 */
export async function saveImage(blob: Blob, filename: string): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (!path) return null;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return path;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return null;
}

/** Reveal a file in the OS file manager (Finder), selecting it. Native only. */
export async function revealItem(path: string): Promise<void> {
  if (!isTauri() || !path) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
