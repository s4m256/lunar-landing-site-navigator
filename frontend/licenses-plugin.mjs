// Build-only Vite plugin: writes the license texts of every npm package whose code ends up in
// the published JavaScript chunks (React, Ajv and their dependencies, plus Vite's small runtime
// helpers). Minification strips the license comments, so the notices ship as a separate file.
// Plain .mjs (with licenses-plugin.d.mts) because the workspace has no @types/node.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

const NODE_MODULES = `${sep}node_modules${sep}`;
const RULE = `\n\n${'='.repeat(72)}\n\n`;

/** Directory of the npm package that contains a module id, or null for project files. */
function packageRoot(id) {
  const file = id.replace(/^\0/, '').split('?')[0];
  const at = file.lastIndexOf(NODE_MODULES);
  if (at < 0) return null;
  const base = file.slice(0, at + NODE_MODULES.length);
  const [first, second] = file.slice(base.length).split(sep);
  return join(base, first.startsWith('@') ? join(first, second) : first);
}

function readLicense(root, pkg) {
  const file = readdirSync(root).find((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name));
  if (file) return readFileSync(join(root, file), 'utf8').trim();
  return `O pacote não inclui arquivo de licença; campo "license" do package.json: ${pkg.license ?? 'ausente'}.`;
}

function section(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const header = `${pkg.name} ${pkg.version} (${pkg.license ?? 'licença não declarada'})`;
  const home = typeof pkg.homepage === 'string' ? `\n${pkg.homepage}` : '';
  return `${header}${home}\n\n${readLicense(root, pkg)}`;
}

/** Vite's LICENSE.md starts with its own MIT license, followed by licenses of its build-time deps. */
function viteRuntimeSection() {
  const root = dirname(createRequire(import.meta.url).resolve('vite/package.json'));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const text = readFileSync(join(root, 'LICENSE.md'), 'utf8');
  const end = text.indexOf('\n# Licenses of bundled dependencies');
  return `vite ${pkg.version} (${pkg.license}) — funções auxiliares de carregamento injetadas pelo build\n${pkg.homepage ?? ''}\n\n${(end > 0 ? text.slice(0, end) : text).trim()}`;
}

export function thirdPartyLicenses({ fileName = 'third-party-licenses.txt' } = {}) {
  return {
    name: 'lunar:third-party-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      const roots = new Set();
      let usesViteRuntime = false;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const [id, info] of Object.entries(output.modules)) {
          if (info.renderedLength === 0) continue;
          if (id.startsWith('\0vite/')) usesViteRuntime = true;
          const root = packageRoot(id);
          if (root) roots.add(root);
        }
      }
      const sections = [...roots].sort((a, b) => a.localeCompare(b)).map(section);
      if (usesViteRuntime) sections.push(viteRuntimeSection());
      const intro = [
        'Licenças de terceiros do código publicado nesta página',
        'Third-party licenses for the code bundled in this page',
        '',
        `Gerado no build por frontend/licenses-plugin.mjs a partir dos módulos presentes nos chunks JavaScript (${sections.length} pacotes).`,
      ].join('\n');
      this.emitFile({ type: 'asset', fileName, source: `${intro}${RULE}${sections.join(RULE)}\n` });
    },
  };
}
