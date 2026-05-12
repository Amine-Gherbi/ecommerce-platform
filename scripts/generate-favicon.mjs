// Builds `src/app/favicon.ico` from the store's wordmark: the lowercase "k"
// that starts "kestrel", drawn on the ink tile the header uses.
//
// The ICO is a container: a directory of PNG images. `sharp` is already a
// devDependency (Next uses it for image optimisation), so this adds no package.
// Run with `node scripts/generate-favicon.mjs`; the generated file is committed
// and served by Next's `app/favicon.ico` convention at `/favicon.ico`.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";

const SIZES = [16, 32, 48];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0c0f0e"/>
  <path d="M11 6.5v19" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/>
  <path d="m14.75 16.5 8.5-9.25" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/>
  <path d="m14.75 16.5 8.5 9.25" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/>
</svg>`;

const source = new TextEncoder().encode(SVG);

const images = await Promise.all(
  SIZES.map((size) =>
    sharp(source)
      .resize(size, size, { fit: "contain" })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  ),
);

// ICONDIR: reserved(2) type(2) count(2), then one 16-byte ICONDIRENTRY per
// image, then the PNG payloads. Width/height of 0 means 256.
const headerSize = 6;
const entrySize = 16;
const totalSize =
  headerSize +
  entrySize * images.length +
  images.reduce((sum, image) => sum + image.length, 0);
const ico = new Uint8Array(totalSize);
const view = new DataView(ico.buffer);

view.setUint16(0, 0, true);
view.setUint16(2, 1, true);
view.setUint16(4, images.length, true);

let offset = headerSize + entrySize * images.length;
images.forEach((image, index) => {
  const entry = headerSize + entrySize * index;
  const size = SIZES[index];
  ico[entry] = size === 256 ? 0 : size;
  ico[entry + 1] = size === 256 ? 0 : size;
  ico[entry + 2] = 0;
  ico[entry + 3] = 0;
  view.setUint16(entry + 4, 1, true);
  view.setUint16(entry + 6, 32, true);
  view.setUint32(entry + 8, image.length, true);
  view.setUint32(entry + 12, offset, true);
  ico.set(image, offset);
  offset += image.length;
});

const target = resolve("src/app/favicon.ico");
writeFileSync(target, ico);
console.log(`wrote ${target} (${ico.length} bytes)`);
