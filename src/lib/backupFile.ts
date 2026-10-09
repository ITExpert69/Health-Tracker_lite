import { isTauri } from "../db";

/** Save a text file via the native dialog (Tauri) or a download (browser). Returns false if cancelled. */
export async function saveTextFile(defaultName: string, content: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: defaultName });
  a.click();
  URL.revokeObjectURL(url);
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
