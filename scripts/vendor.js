import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function prepareVendor() {
  await mkdir(new URL('../src/vendor/', import.meta.url), { recursive: true });
  for (const [name, library] of [['three', 'three'], ['supabase', '@supabase/supabase-js']]) {
    await build({ stdin: { contents: `export * from '${library}';`, resolveDir: root }, outfile: resolve(root, `src/vendor/${name}.js`), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await prepareVendor();
