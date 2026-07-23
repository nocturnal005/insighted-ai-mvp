/**
 * Regenerate deterministic, pupil-free demo fixtures.
 *
 * These are intentionally synthetic and contain no pupil data. They are suitable for
 * provider smoke tests and client walkthroughs, never for accuracy claims.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const brailleDir = path.join(root, "demo-resources", "braille");
const qualityDir = path.join(root, "demo-resources", "quality");
const stemDir = path.join(root, "demo-resources", "stem");
for (const directory of [brailleDir, qualityDir, stemDir]) {
  mkdirSync(directory, { recursive: true });
}

// Uncontracted UEB cells for "hello world". A valid, generously sized PNG is important:
// the former 550-byte fixture contained a truncated image stream that previews could
// partially inspect, but image-recognition providers could not decode.
const brailleCells = [
  [1, 2, 5], // h
  [1, 5], // e
  [1, 2, 3], // l
  [1, 2, 3], // l
  [1, 3, 5], // o
  [], // space
  [2, 4, 5, 6], // w
  [1, 3, 5], // o
  [1, 2, 3, 5], // r
  [1, 2, 3], // l
  [1, 4, 5], // d
];
const dotPosition = {
  1: [0, 0],
  2: [0, 1],
  3: [0, 2],
  4: [1, 0],
  5: [1, 1],
  6: [1, 2],
};
const brailleDots = brailleCells
  .flatMap((dots, cellIndex) =>
    Array.from({ length: 6 }, (_unused, lineIndex) =>
      dots.map((dot) => {
        const [column, row] = dotPosition[dot];
        const cx = 150 + cellIndex * 76 + column * 27;
        const cy = 175 + lineIndex * 220 + row * 33;
        return `
          <circle cx="${cx + 2}" cy="${cy + 2}" r="8" fill="#8f9494" opacity="0.72"/>
          <circle cx="${cx}" cy="${cy}" r="7" fill="#d8dcda"/>
          <circle cx="${cx - 2}" cy="${cy - 2}" r="2.6" fill="#ffffff" opacity="0.95"/>`;
      }),
    ).flat(),
  )
  .join("");
const brailleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <rect width="1200" height="1500" fill="#f4f5f2"/>
  ${brailleDots}
</svg>`;
const braille = await sharp(Buffer.from(brailleSvg))
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(path.join(brailleDir, "sample-braille-work.png"), braille);
writeFileSync(path.join(qualityDir, "sample-eval-page.png"), braille);

const stemSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#ffffff"/>
  <rect x="28" y="28" width="1144" height="744" rx="8" fill="none" stroke="#172033" stroke-width="3"/>
  <text x="80" y="92" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#172033">Cooling experiment — line graph</text>
  <text x="80" y="132" font-family="Arial, sans-serif" font-size="22" fill="#4b5563">SYNTHETIC DEMO IMAGE — no pupil data</text>
  <line x1="150" y1="650" x2="1080" y2="650" stroke="#374151" stroke-width="4"/>
  <line x1="150" y1="650" x2="150" y2="205" stroke="#374151" stroke-width="4"/>
  <g font-family="Arial, sans-serif" font-size="20" fill="#374151">
    <text x="142" y="685">0</text><text x="318" y="685">2</text><text x="498" y="685">4</text>
    <text x="678" y="685">6</text><text x="858" y="685">8</text><text x="1025" y="685">10</text>
    <text x="105" y="657">20</text><text x="105" y="547">30</text><text x="105" y="437">40</text>
    <text x="105" y="327">50</text><text x="105" y="217">60</text>
  </g>
  <g stroke="#d1d5db" stroke-width="2">
    <line x1="150" y1="540" x2="1080" y2="540"/><line x1="150" y1="430" x2="1080" y2="430"/>
    <line x1="150" y1="320" x2="1080" y2="320"/><line x1="150" y1="210" x2="1080" y2="210"/>
  </g>
  <polyline points="150,232 330,298 510,386 690,463 870,518 1050,562" fill="none" stroke="#0b8f55" stroke-width="8"/>
  <g fill="#0b8f55">
    <circle cx="150" cy="232" r="9"/><circle cx="330" cy="298" r="9"/><circle cx="510" cy="386" r="9"/>
    <circle cx="690" cy="463" r="9"/><circle cx="870" cy="518" r="9"/><circle cx="1050" cy="562" r="9"/>
  </g>
  <text x="535" y="738" font-family="Arial, sans-serif" font-size="27" fill="#172033">Time (minutes)</text>
  <text x="-500" y="72" transform="rotate(-90)" font-family="Arial, sans-serif" font-size="27" fill="#172033">Temperature (°C)</text>
</svg>`;

await sharp(Buffer.from(stemSvg))
  .png({ compressionLevel: 9 })
  .toFile(path.join(stemDir, "sample-line-graph.png"));

console.log("Synthetic Braille, quality-eval, and STEM fixtures regenerated.");
