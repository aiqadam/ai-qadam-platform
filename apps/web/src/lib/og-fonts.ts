// F-S5.4 — load Geist TTFs from the npm package into module-scoped
// ArrayBuffers so each card render reuses the same allocation. Reading
// the files at import time would block the dev server's first request;
// we load lazily on first call.
//
// TTFs come from the `geist` npm package (apps/web/node_modules/geist/
// dist/fonts/geist-sans/). Satori 0.10+ accepts TTF/OTF/WOFF — not
// WOFF2 — so we use the TTF variants.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

let cached: { regular: ArrayBuffer; semiBold: ArrayBuffer } | null = null;

export async function loadOgFonts(): Promise<{
  regular: ArrayBuffer;
  semiBold: ArrayBuffer;
}> {
  if (cached) return cached;
  // The geist package's `exports` field only exposes the JS modules
  // (`./font/sans` etc.) — not `./package.json` or `./dist/fonts/*.ttf`.
  // Resolve through the JS entry point, then walk to the TTF dir.
  // dist/sans.js → dist/fonts/geist-sans/
  const sansJsPath = require.resolve('geist/font/sans');
  const fontsDir = join(dirname(sansJsPath), 'fonts/geist-sans/');
  const [regularBuf, semiBoldBuf] = await Promise.all([
    readFile(`${fontsDir}Geist-Regular.ttf`),
    readFile(`${fontsDir}Geist-SemiBold.ttf`),
  ]);
  cached = {
    regular: regularBuf.buffer.slice(
      regularBuf.byteOffset,
      regularBuf.byteOffset + regularBuf.byteLength,
    ) as ArrayBuffer,
    semiBold: semiBoldBuf.buffer.slice(
      semiBoldBuf.byteOffset,
      semiBoldBuf.byteOffset + semiBoldBuf.byteLength,
    ) as ArrayBuffer,
  };
  return cached;
}
