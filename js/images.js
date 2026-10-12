'use strict';

const imageUrls = new Map();
function getImageUrl(item) {
  if (!item.image) return '';

  const known = imageUrls.get(item.id);
  if (known && known.blob === item.image.blob) return known.url;
  if (known) URL.revokeObjectURL(known.url);   // the picture was replaced

  const url = URL.createObjectURL(item.image.blob);
  imageUrls.set(item.id, { blob: item.image.blob, url: url });
  return url;
}

function forgetImageUrl(id) {
  const known = imageUrls.get(id);
  if (known) {
    URL.revokeObjectURL(known.url);
    imageUrls.delete(id);
  }
}

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

    const scale = Math.min(1, LIMITS.imageShrinkTo / Math.max(width, height));
    const newWidth = Math.max(1, Math.round(width * scale));
    const newHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';                 
    context.fillRect(0, 0, newWidth, newHeight);
    context.drawImage(loaded.img, 0, 0, newWidth, newHeight);

    const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
    if (!blob) throw new Error('The image could not be shrunk');

    if (blob.size >= file.size && scale === 1) {
      return { blob: file, name: name, type: file.type, width: width, height: height, size: file.size };
    }
    return { blob: blob, name: name, type: blob.type, width: newWidth, height: newHeight, size: blob.size };
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}
