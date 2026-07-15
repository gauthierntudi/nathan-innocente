/**
 * Safely trigger a file download without navigating away from the page.
 * Safari often ignores `download` for `application/pdf` blobs and opens them
 * in the same tab (breaking multi-step flows).
 */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const safeBlob =
    blob.type === "application/pdf" || !blob.type
      ? new Blob([blob], { type: "application/octet-stream" })
      : blob;

  const objectUrl = URL.createObjectURL(safeBlob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Safari may still be reading the blob URL after click.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
