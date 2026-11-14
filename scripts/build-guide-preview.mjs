import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.resolve(process.argv[2] || "/tmp/lunar-delivery");
const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {GuidePortrait} from './frontend/src/mission/MissionArt';
      import {MissionDialogue,WELCOME_DIALOGUE} from './frontend/src/mission/MissionDialogue';
      createRoot(document.getElementById('demo')).render(<>
        <GuidePortrait/>
        <section><h1>Sua guia da missão</h1><p>Você escolheu este astronauta. Clique em <strong>Ouvir fala</strong> para ouvir a apresentação.</p>
        <MissionDialogue text={WELCOME_DIALOGUE}/>
        <p className="note">A voz depende das opções em português disponíveis no seu navegador e dispositivo. Algumas vozes precisam de internet.</p>
        <a href="Lunar-Missao.html">Testar a missão completa →</a></section>
      </>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".webp": "dataurl" },
  legalComments: "inline",
});
const code = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Astronauta — texto e voz</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f4f1;color:#17191c;font:17px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:36px 24px}#demo{display:grid;grid-template-columns:240px minmax(0,1fr);gap:40px;align-items:center}h1{font-size:30px;line-height:1.2}p{margin:20px 0}.guide-portrait{display:block;width:100%;max-height:480px;object-fit:contain}.mission-dialogue{padding:20px;background:white;border:1px solid #d1d5d8;border-radius:8px}.typewriter-controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;align-items:flex-start}.speech-control{display:contents}.speech-control__status{flex-basis:100%;order:1;font-size:15px}.speech-control__status:empty{display:none}button{padding:10px 14px;min-height:44px;font:inherit;cursor:pointer;border:1px solid #767676;border-radius:5px;background:#fff;color:#17191c}button:disabled,button[aria-disabled="true"]{cursor:default;color:#595959;background:#f4f4f1}.note,footer{font-size:14px;color:#4d5156}a{color:#1552a0}a:focus-visible,button:focus-visible{outline:3px solid #1d63bc;outline-offset:3px}footer{margin-top:32px;border-top:1px solid #d1d5d8;padding-top:16px}@media(max-width:650px){#demo{grid-template-columns:1fr;gap:8px}.guide-portrait{max-height:260px}h1{font-size:26px}main{padding:20px 16px}.mission-dialogue{padding:16px}}
</style></head><body><main><div id="demo"></div><footer>Imagem: <a href="https://poly.google.com/view/dLHpzNdygsg">Astronaut, de Poly</a> · <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>. Prévia existente do <a href="https://github.com/google/model-viewer/blob/9c6fea9ac579e618bf2932456d3308309017df00/packages/modelviewer.dev/assets/poster-astronaut.webp">model-viewer</a>, sem alterações além do tamanho de exibição.</footer></main><script>${code}</script></body></html>`;
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "Escolher-astronauta.html"), html);
console.log(
  `Guia com texto e voz: ${path.join(directory, "Escolher-astronauta.html")}`,
);
