import fs from 'fs';
import path from 'path';
import * as mdi from '@mdi/js';

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.(vue|ts)$/.test(entry.name)) result.push(full);
  }
  return result;
}

const icons = new Set();
for (const file of walk('src')) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.endsWith('icons/mdi-icons.ts') || normalized.endsWith('vuetify.ts')) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/mdi-[a-z0-9-]+/g)) {
    if (match[0] === 'mdi-svg' || match[0] === 'mdi-icons') continue;
    icons.add(match[0]);
  }
}

function toExport(name) {
  const parts = name.replace(/^mdi-/, '').split('-');
  return 'mdi' + parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

const sorted = [...icons].sort();
const imports = [];
const entries = [];
const missing = [];

for (const icon of sorted) {
  const exp = toExport(icon);
  if (!(exp in mdi)) {
    missing.push(`${icon} -> ${exp}`);
    continue;
  }
  imports.push(exp);
  entries.push(`  '${icon}': ${exp},`);
}

if (missing.length) {
  console.error('Missing icons in @mdi/js:', missing.join('\n'));
  process.exit(1);
}

const out = `/** 项目用到的 MDI 图标(tree-shaken，由 mdi-svg 解析 mdi-* 名称) */
import {
  ${imports.join(',\n  ')},
} from '@mdi/js';

export const mdiPathByName: Record<string, string> = {
${entries.join('\n')}
};

/** 将 mdi-* 名称解析为 @mdi/js SVG path */
export function resolveMdiIcon(icon: string | undefined): string | undefined {
  if (icon?.startsWith('mdi-')) {
    return mdiPathByName[icon] ?? icon;
  }
  return icon;
}
`;

fs.mkdirSync('src/icons', {recursive: true});
fs.writeFileSync('src/icons/mdi-icons.ts', out);
console.log(`Generated ${sorted.length} icons -> src/icons/mdi-icons.ts`);
