import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.resolve(
  process.argv[2] || path.join(tmpdir(), "lunar-delivery"),
);
const output = path.join(directory, "Lunar-Missao.html");
const embeddedFile = async (filename) => {
  const extension = path.extname(filename);
  const mime =
    extension === ".json"
      ? "application/json"
      : extension === ".svg"
        ? "image/svg+xml"
        : "application/octet-stream";
  return `data:${mime};base64,${(await readFile(filename)).toString("base64")}`;
};

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["frontend/src/main.tsx"],
  outfile: path.join(directory, "lunar-inline.js"),
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  legalComments: "inline",
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.BASE_URL": '"./"',
  },
  loader: {
    ".svg": "dataurl",
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".webp": "dataurl",
  },
  plugins: [
    {
      name: "embed-file-imports",
      setup(plugin) {
        plugin.onResolve({ filter: /\?(raw|url)$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.split("?")[0]),
          namespace: args.path.endsWith("?raw") ? "raw-file" : "file-url",
        }));
        plugin.onLoad(
          { filter: /.*/, namespace: "raw-file" },
          async (args) => ({
            contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))};`,
            loader: "js",
          }),
        );
        plugin.onLoad(
          { filter: /.*/, namespace: "file-url" },
          async (args) => ({
            contents: `export default ${JSON.stringify(await embeddedFile(args.path))};`,
            loader: "js",
          }),
        );
      },
    },
  ],
});

const script = bundle.outputFiles.find((file) =>
  file.path.endsWith(".js"),
)?.text;
const style = bundle.outputFiles.find((file) =>
  file.path.endsWith(".css"),
)?.text;
if (!script || !style)
  throw new Error("The standalone build must contain both JavaScript and CSS.");
const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Uma missão lunar guiada: escolha um local e explore as direções do Sol e da Terra.">
<title>Lunar — Uma missão, duas direções</title>
<style>${style.replace(/<\/style/gi, "<\\/style")}</style>
</head><body><div id="root"></div>
<noscript>Ative JavaScript no navegador para explorar a missão lunar.</noscript>
<script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`;
await mkdir(directory, { recursive: true });
await writeFile(output, html);
await writeFile(
  path.join(directory, "LEIA-ME.txt"),
  [
    "LUNAR — Uma missão, duas direções",
    "",
    "Abra Lunar-Missao.html em um navegador moderno no computador (Chrome, Edge ou Firefox).",
    "Todos os componentes, ilustrações e dados estão incorporados. Não precisa instalar Node ou Python.",
    "As fontes citadas em links externos exigem internet, apenas se você decidir abri-las.",
    "",
    "Os quatro locais são hipotéticos; o critério do exercício usa o horizonte tangente idealizado.",
    "Não calcula bloqueio por montanhas, energia gerada, enlace de rádio nem segurança de pouso.",
    "CLPS é um programa de entregas comerciais robóticas; personagens e voos são ilustrativos.",
    "",
    "Para reproduzir a partir do código: npm ci, npm run typecheck, npm run build:offline.",
    "As fontes e a proveniência estão no botão Sobre a missão.",
    "",
  ].join("\n"),
);
console.log(
  `HTML autocontido: ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`,
);
