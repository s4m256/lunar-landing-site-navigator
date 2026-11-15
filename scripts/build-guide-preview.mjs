// Keep the previously shared preview link on the real game flow rather than
// maintaining a separate character demo that can drift from the application.
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

await import("./build-offline.mjs");
const directory = path.resolve(
  process.argv[2] || path.join(tmpdir(), "lunar-delivery"),
);
await copyFile(
  path.join(directory, "Lunar-Missao.html"),
  path.join(directory, "Escolher-astronauta.html"),
);
await copyFile(
  path.join(directory, "Lunar-Missao.html"),
  path.join(directory, "Lunar-Jogo.html"),
);
await copyFile(
  path.join(directory, "Lunar-Missao.html"),
  path.join(directory, "Lunar-Lua-3D.html"),
);
console.log(
  `Link anterior atualizado para a cena de jogo: ${path.join(directory, "Escolher-astronauta.html")}`,
);
