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
    ".woff2": "dataurl",
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
const fontLicense = await readFile(
  path.join(root, "frontend/src/assets/fonts/OFL.txt"),
  "utf8",
);
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A guided lunar mission: choose a site and explore the directions of the Sun and Earth.">
<title>Lunar — One mission, two directions</title>
<style>${style.replace(/<\/style/gi, "<\\/style")}</style>
</head><body><div id="root"></div>
<noscript>Enable JavaScript in your browser to explore the lunar mission.</noscript>
<script type="text/plain" id="jetbrains-mono-license">${fontLicense.replace(/<\/script/gi, "<\\/script")}</script>
<script>${script.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`;
await mkdir(directory, { recursive: true });
await writeFile(output, html);
const readme = [
  "LUNAR — One mission, two directions",
  "",
  "Open Lunar-English.html in a modern desktop browser (Chrome, Edge, or Firefox).",
  "The app, assets, font, and science data are embedded. No installation is required.",
  "Back returns to the previous line. Continue reveals a typing line, then advances on the next click.",
  "Voice controls are temporarily removed. Reduced-motion preferences are respected.",
  "External source links require internet only when opened.",
  "",
  "The four sites are hypothetical; the exercise compares body centers with an idealized tangent horizon.",
  "It does not calculate mountain obstruction, generated power, radio performance, or landing safety.",
  "CLPS missions are robotic. The guide and flights are illustrative.",
  "",
  "Build from source: npm ci, npm run typecheck, npm run build:offline.",
  "Source credits and data provenance are available under About.",
  "",
].join("\n");
await writeFile(path.join(directory, "README.txt"), readme);
await writeFile(path.join(directory, "LEIA-ME.txt"), readme);
await writeFile(path.join(directory, "Lunar-English.html"), html);
console.log(
  `HTML autocontido: ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`,
);
