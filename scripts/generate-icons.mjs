/**
 * Generates the PWA icons.
 *
 * The app had a manifest but no icons at all, which meant browsers would not
 * offer to install it — and an installable app matters here, because riders use
 * this from a phone mount with patchy coverage.
 *
 * Rather than committing binaries nobody can diff, the icons are drawn here from
 * the brand colours: a winding road climbing through the frame. Run with
 * `bun run icons` after changing anything below.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BACKGROUND = [45, 51, 42]; // #2D332A
const ROAD = [167, 201, 87]; // #A7C957
const ROAD_EDGE = [56, 102, 65]; // #386641

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encodes raw RGBA pixels as a PNG. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

  // Each scanline is prefixed with its filter type; 0 means "none".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));

/**
 * @param size    pixel dimensions of the square icon
 * @param padding fraction of the icon kept clear of artwork; maskable icons need
 *                a wide safe zone because launchers crop them to a circle
 */
function drawIcon(size, padding) {
  const rgba = Buffer.alloc(size * size * 4);

  const inner = size * (1 - padding * 2);
  const originY = size * padding;
  const centerX = size / 2;
  const amplitude = inner * 0.22;
  const roadHalfWidth = inner * 0.085;
  const edgeHalfWidth = roadHalfWidth * 1.45;
  const cornerRadius = size * 0.22;

  // The road as a function of height: two smooth bends, wider at the bottom to
  // suggest perspective.
  const roadX = (y) => {
    const t = (y - originY) / inner;
    return centerX + Math.sin(t * Math.PI * 1.6 + 0.4) * amplitude * (0.45 + t * 0.8);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;

      // Rounded-square background.
      const dx = Math.max(cornerRadius - x, x - (size - cornerRadius), 0);
      const dy = Math.max(cornerRadius - y, y - (size - cornerRadius), 0);
      const cornerDistance = Math.hypot(dx, dy);
      const backgroundAlpha =
        padding > 0.15 ? 1 : 1 - smoothstep(cornerRadius - 1.5, cornerRadius + 1.5, cornerDistance);

      let colour = BACKGROUND;

      if (y >= originY && y <= originY + inner) {
        const distance = Math.abs(x - roadX(y));
        const edgeCoverage = 1 - smoothstep(edgeHalfWidth - 1.5, edgeHalfWidth + 1.5, distance);
        const roadCoverage = 1 - smoothstep(roadHalfWidth - 1.5, roadHalfWidth + 1.5, distance);

        colour = mix(colour, ROAD_EDGE, edgeCoverage);
        colour = mix(colour, ROAD, roadCoverage);
      }

      rgba[offset] = colour[0];
      rgba[offset + 1] = colour[1];
      rgba[offset + 2] = colour[2];
      rgba[offset + 3] = Math.round(backgroundAlpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const icons = [
  ['icon-192.png', 192, 0.14],
  ['icon-512.png', 512, 0.14],
  // Launchers crop maskable icons to a circle, so keep the artwork well inside.
  ['icon-maskable-512.png', 512, 0.22],
  ['apple-touch-icon.png', 180, 0.12],
];

for (const [name, size, padding] of icons) {
  const png = drawIcon(size, padding);
  writeFileSync(join(OUTPUT_DIR, name), png);
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
