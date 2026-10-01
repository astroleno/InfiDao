import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(brotliCompress);
// Serial build-time work; no compression CPU cost in the request path.
export async function precompress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await precompress(path);
    else if (entry.isFile() && /\.(js|css)$/.test(entry.name)) {
      const bytes = await readFile(path);
      await writeFile(path + '.br', await compress(bytes, { params: {
        [constants.BROTLI_PARAM_QUALITY]: 9,
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      } }));
    }
  }
}
