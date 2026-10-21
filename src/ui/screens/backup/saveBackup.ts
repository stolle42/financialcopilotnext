import { createBackup } from "@/store/backup";

/** Hands `text` to the browser as a download named `fileName` (FR-070). */
function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The browser starts the download from the link before this runs.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves everything in the app to one file, as Save backup on the Backup screen does (FR-070). */
export function saveBackup(store: Parameters<typeof createBackup>[0]) {
  const backup = createBackup(store);
  download(backup.text, backup.fileName);
}
