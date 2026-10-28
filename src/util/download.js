export function downloadTextFile(text, filename, mime) {
  downloadBlobFile(new Blob([text], { type: mime }), filename);
}

// Télécharge un Blob binaire déjà construit (ZIP, PNG...).
export function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
