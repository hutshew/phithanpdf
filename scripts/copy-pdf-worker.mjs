import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const source = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
const target = join(process.cwd(), 'public', 'pdf.worker.mjs');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
