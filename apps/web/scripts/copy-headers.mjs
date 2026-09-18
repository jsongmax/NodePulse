import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcHeaders = path.resolve(__dirname, '../../hub/public/_headers');
const distHeaders = path.resolve(__dirname, '../dist/_headers');

if (fs.existsSync(srcHeaders)) {
  fs.mkdirSync(path.dirname(distHeaders), { recursive: true });
  fs.copyFileSync(srcHeaders, distHeaders);
  console.log('Successfully copied _headers to dist/_headers');
} else {
  console.warn('Warning: Source _headers not found at', srcHeaders);
}
