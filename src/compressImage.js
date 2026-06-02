// Compress an image File in the browser before uploading to storage.
// Downscales so the longest edge is at most maxEdge px and re-encodes as JPEG,
// which keeps daily photos phone-sized (a few hundred KB) instead of multi-MB
// camera originals. Returns a Blob ready for Firebase uploadBytes.
//
// Used by the admin Art and Entrance photo uploads.
export async function compressImage(file, { maxEdge = 2160, quality = 0.85 } = {}) {
  // "from-image" applies EXIF orientation so rotated phone photos come out upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  // Fall back to the original if the browser couldn't encode the blob.
  return blob ?? file;
}
