import { mkdir, copyFile, cp } from 'node:fs/promises';
import { prepareVendor } from './vendor.js';
await prepareVendor();
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
for (const file of ['index.html', 'favicon.svg']) await copyFile(new URL(file, root), new URL(`dist/${file}`, root));
await cp(new URL('src/', root), new URL('dist/src/', root), { recursive: true });
console.log('Static build ready in dist/');
