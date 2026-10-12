'use strict';

/* =====================================================================
   images.js - reading, shrinking and showing pictures.

   Small pictures are saved exactly as they were picked. Big ones (phone
   photos, for example) are shrunk first so the browser's storage isn't
   used up by a handful of photos.

   Uses: LIMITS from helpers.js.
   ===================================================================== */

// A picture saved in the database is a "blob" (a file in memory). To show it
// in an <img> tag the browser needs a temporary address for it, made with
// URL.createObjectURL(). We keep one per item so we don't make it twice.
const imageUrls = new Map();   // item id -> { blob, url }

// The address to use as <img src="..."> for an image item.
function getImageUrl(item) {
  if (!item.image) return '';

  const known = imageUrls.get(item.id);
  if (known && known.blob === item.image.blob) return known.url;
  if (known) URL.revokeObjectURL(known.url);   // the picture was replaced

  const url = URL.createObjectURL(item.image.blob);
  imageUrls.set(item.id, { blob: item.image.blob, url: url });
  return url;
}

// Free the temporary address when an item is deleted.
function forgetImageUrl(id) {
  const known = imageUrls.get(id);
  if (known) {
    URL.revokeObjectURL(known.url);
    imageUrls.delete(id);
  }
}

// Loads a picked file into an <img> so we can find out its size.
// Fails (rejects) if the file isn't a picture the browser can read.
function loadImageElement(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { resolve({ img: img, url: url }); };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('The file could not be read as an image'));
    };
    img.src = url;
  });
}

// Takes a picked file and returns what we save for it:
// { blob, name, type, width, height, size }
async function readImageFile(file) {
  const name = file.name || 'pasted-image';
  const loaded = await loadImageElement(file);

  try {
    const width = loaded.img.naturalWidth;
    const height = loaded.img.naturalHeight;

    const isBig = Math.max(width, height) > LIMITS.imageKeepSide || file.size > LIMITS.imageKeepBytes;
    if (!isBig) {
      return { blob: file, name: name, type: file.type, width: width, height: height, size: file.size };
    }
    if (!width || !height) throw new Error('The image size is unknown');

    // Draw the picture smaller on a hidden canvas, then save the canvas as a JPEG.
    const scale = Math.min(1, LIMITS.imageShrinkTo / Math.max(width, height));
    const newWidth = Math.max(1, Math.round(width * scale));
    const newHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';                 // JPEG has no transparency
    context.fillRect(0, 0, newWidth, newHeight);
    context.drawImage(loaded.img, 0, 0, newWidth, newHeight);

    const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
    if (!blob) throw new Error('The image could not be shrunk');

    // If shrinking didn't help (and the size is unchanged), keep the original.
    if (blob.size >= file.size && scale === 1) {
      return { blob: file, name: name, type: file.type, width: width, height: height, size: file.size };
    }
    return { blob: blob, name: name, type: blob.type, width: newWidth, height: newHeight, size: blob.size };
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}
