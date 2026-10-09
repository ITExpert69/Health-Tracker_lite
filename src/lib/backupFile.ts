import { isTauri } from "../db";

/**
 * Save a text file. Desktop: native save dialog. iPad/iPhone: the share sheet
 * ("Save to Files", iCloud Drive, AirDrop…). Other browsers: a download.
 * Returns false if the user cancelled.
 */
export async function saveTextFile(defaultName: string, content: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }
  const file = new File([content], defaultName, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: defaultName });
      return true;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return false;
      // NotAllowedError etc. (e.g. lost user activation): fall through to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: defaultName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Pick and read a text file. Returns null if cancelled. */
export async function openTextFile(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    return readTextFile(path);
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      void f.text().then(resolve);
    };
    input.click();
  });
}
