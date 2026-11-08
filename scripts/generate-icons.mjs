import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const rounded = (background) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${background === "rounded" ? 'rx="116"' : ""} fill="#111316"/>
  <path d="M352 152a144 144 0 1 0 0 208" fill="none" stroke="#F3F1EA" stroke-width="44" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="40" fill="#FF5C35"/>
</svg>
`;

const maskable = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111316"/>
  <g transform="translate(256 256) scale(0.76) translate(-256 -256)">
    <path d="M352 152a144 144 0 1 0 0 208" fill="none" stroke="#F3F1EA" stroke-width="44" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="40" fill="#FF5C35"/>
  </g>
</svg>
`;

const targets = [
  { file: "static/icons/icon-192.png", size: 192, svg: rounded("rounded") },
  { file: "static/icons/icon-512.png", size: 512, svg: rounded("rounded") },
  {
    file: "static/icons/icon-maskable-512.png",
    size: 512,
    svg: maskable,
  },
  {
    file: "static/icons/apple-touch-icon.png",
    size: 180,
    svg: rounded("square"),
  },
];

await mkdir("static/icons", { recursive: true });

for (const { file, size, svg } of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log(`generated ${file}`);
}
