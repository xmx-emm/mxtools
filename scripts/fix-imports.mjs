import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'src');

const simple = [
  [/@\/data\/steam\.ts/g, '@/types/steam.ts'],
  [/@\/data\/apex_video\.ts/g, '@/types/apex.ts'],
  [/@\/data\/url\.ts/g, '@/data/url_other.ts'],
  [/@\/data\/video\.ts/g, '@/data/url_video.ts'],
  [/@\/data\/game_resolution_presets\.ts/g, '@/data/presets/game_resolution_presets.ts'],
  [/@\/data\/game_refresh_rate_presets\.ts/g, '@/data/presets/game_refresh_rate_presets.ts'],
];

const typeImportMap = {
  WindowsUser: '@/types/windows.ts',
  RdpConnection: '@/types/rdp.ts',
  Ipv: '@/types/network.ts',
  PortForwarding: '@/types/network.ts',
  SteamUser: '@/types/steam.ts',
  EaDesktopUser: '@/types/ea.ts',
  ApexLauncherAccount: '@/types/apex.ts',
};

function resolveTypeModule(inner) {
  const syms = inner.split(',').map((s) => s.trim());
  const mods = [...new Set(syms.map((s) => typeImportMap[s] || '@/types/index.ts'))];
  return mods.length === 1 ? mods[0] : null;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(vue|ts)$/.test(ent.name)) {
      let s = fs.readFileSync(p, 'utf8');
      const orig = s;
      for (const [from, to] of simple) s = s.replace(from, to);

      s = s.replace(
        /import type \{([^}]+)\} from ['"]@\/type\.ts['"];/g,
        (m, inner) => {
          const mod = resolveTypeModule(inner);
          return mod ? `import type {${inner}} from '${mod}';` : m;
        },
      );
      s = s.replace(
        /import \{([^}]+)\} from ['"]@\/type\.ts['"];/g,
        (m, inner) => {
          const mod = resolveTypeModule(inner);
          return mod ? `import type {${inner}} from '${mod}';` : m;
        },
      );

      if (s !== orig) fs.writeFileSync(p, s, 'utf8');
    }
  }
}

walk(root);
console.log('import paths updated');
