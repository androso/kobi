import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const width = 720;
const height = 520;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));

  return Buffer.concat([length, typeBytes, data, crc]);
}

function createCanvas(background) {
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = background[0];
      pixels[index + 1] = background[1];
      pixels[index + 2] = background[2];
      pixels[index + 3] = background[3];
    }
  }

  return pixels;
}

function blend(base, color, alpha) {
  const a = (color[3] / 255) * alpha;
  return [
    Math.round(color[0] * a + base[0] * (1 - a)),
    Math.round(color[1] * a + base[1] * (1 - a)),
    Math.round(color[2] * a + base[2] * (1 - a)),
    255
  ];
}

function setPixel(pixels, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  const base = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
  const next = blend(base, color, alpha);
  pixels[index] = next[0];
  pixels[index + 1] = next[1];
  pixels[index + 2] = next[2];
  pixels[index + 3] = next[3];
}

function rect(pixels, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setPixel(pixels, xx, yy, color);
  }
}

function roundedRect(pixels, x, y, w, h, radius, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = Math.max(x - xx + radius, 0, xx - (x + w - radius - 1));
      const dy = Math.max(y - yy + radius, 0, yy - (y + h - radius - 1));
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, xx, yy, color);
    }
  }
}

function circle(pixels, cx, cy, radius, color) {
  for (let yy = cy - radius; yy <= cy + radius; yy += 1) {
    for (let xx = cx - radius; xx <= cx + radius; xx += 1) {
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2) setPixel(pixels, xx, yy, color);
    }
  }
}

function line(pixels, x1, y1, x2, y2, color, thickness = 4) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    circle(pixels, x, y, Math.max(1, Math.floor(thickness / 2)), color);
  }
}

function rotatedRect(pixels, cx, cy, w, h, angle, color) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = -h / 2; y < h / 2; y += 1) {
    for (let x = -w / 2; x < w / 2; x += 1) {
      const xx = Math.round(cx + x * cos - y * sin);
      const yy = Math.round(cy + x * sin + y * cos);
      setPixel(pixels, xx, yy, color);
    }
  }
}

function drawBackdrop(pixels) {
  roundedRect(pixels, 90, 118, 190, 24, 12, [255, 255, 255, 38]);
  roundedRect(pixels, 348, 154, 250, 26, 13, [255, 255, 255, 42]);
  roundedRect(pixels, 128, 264, 420, 22, 11, [255, 255, 255, 34]);
  circle(pixels, 112, 388, 20, [255, 255, 255, 34]);
  circle(pixels, 584, 238, 28, [255, 255, 255, 34]);
  circle(pixels, 510, 96, 7, [255, 255, 255, 150]);
  line(pixels, 128, 94, 128, 118, [255, 255, 255, 118], 3);
  line(pixels, 116, 106, 140, 106, [255, 255, 255, 118], 3);
  line(pixels, 594, 334, 594, 360, [255, 255, 255, 118], 3);
  line(pixels, 581, 347, 607, 347, [255, 255, 255, 118], 3);
}

function drawLiveSession(pixels) {
  drawBackdrop(pixels);
  rotatedRect(pixels, 350, 238, 230, 190, -0.18, [6, 82, 170, 255]);
  rotatedRect(pixels, 350, 238, 174, 126, -0.18, [245, 250, 255, 255]);
  for (let y = 192; y <= 280; y += 30) line(pixels, 284, y, 418, y - 24, [104, 168, 238, 255], 3);
  for (let x = 306; x <= 390; x += 42) line(pixels, x, 174, x + 34, 294, [104, 168, 238, 255], 3);
  line(pixels, 308, 226, 326, 242, [13, 119, 229, 255], 8);
  line(pixels, 326, 242, 358, 200, [13, 119, 229, 255], 8);
  line(pixels, 392, 248, 414, 268, [13, 119, 229, 255], 8);
  line(pixels, 414, 268, 448, 218, [13, 119, 229, 255], 8);
  circle(pixels, 456, 324, 54, [46, 203, 220, 255]);
  circle(pixels, 456, 324, 40, [7, 86, 180, 255]);
  line(pixels, 456, 324, 480, 300, [255, 255, 255, 255], 6);
  line(pixels, 456, 324, 444, 354, [255, 255, 255, 190], 4);
}

function drawCurriculum(pixels) {
  drawBackdrop(pixels);
  roundedRect(pixels, 240, 130, 250, 280, 22, [5, 73, 155, 255]);
  roundedRect(pixels, 266, 158, 198, 220, 12, [250, 253, 255, 255]);
  rect(pixels, 292, 188, 146, 10, [28, 129, 230, 255]);
  rect(pixels, 292, 218, 118, 8, [137, 186, 231, 255]);
  rect(pixels, 292, 242, 146, 8, [137, 186, 231, 255]);
  rect(pixels, 292, 286, 92, 8, [137, 186, 231, 255]);
  rect(pixels, 292, 310, 126, 8, [137, 186, 231, 255]);
  line(pixels, 268, 158, 232, 196, [46, 203, 220, 255], 10);
  line(pixels, 464, 378, 512, 420, [251, 191, 36, 255], 10);
  circle(pixels, 512, 420, 18, [255, 255, 255, 255]);
  circle(pixels, 226, 196, 18, [255, 255, 255, 255]);
  line(pixels, 210, 92, 252, 92, [255, 255, 255, 150], 5);
  line(pixels, 231, 72, 231, 112, [255, 255, 255, 150], 5);
}

function drawStudents(pixels) {
  drawBackdrop(pixels);
  roundedRect(pixels, 232, 150, 260, 190, 20, [5, 73, 155, 255]);
  roundedRect(pixels, 264, 184, 196, 116, 12, [250, 253, 255, 255]);
  circle(pixels, 316, 236, 32, [16, 185, 129, 255]);
  circle(pixels, 362, 236, 32, [251, 191, 36, 255]);
  circle(pixels, 408, 236, 32, [56, 189, 248, 255]);
  circle(pixels, 316, 228, 10, [255, 255, 255, 255]);
  circle(pixels, 362, 228, 10, [255, 255, 255, 255]);
  circle(pixels, 408, 228, 10, [255, 255, 255, 255]);
  roundedRect(pixels, 292, 250, 48, 24, 12, [255, 255, 255, 255]);
  roundedRect(pixels, 338, 250, 48, 24, 12, [255, 255, 255, 255]);
  roundedRect(pixels, 384, 250, 48, 24, 12, [255, 255, 255, 255]);
  line(pixels, 280, 372, 448, 372, [46, 203, 220, 255], 10);
  line(pixels, 308, 402, 420, 402, [255, 255, 255, 155], 7);
}

function writePng(name, draw) {
  const pixels = createCanvas([16, 119, 229, 0]);
  draw(pixels);

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);

  writeFileSync(join("apps/web/public/auth", name), png);
}

writePng("live-session.png", drawLiveSession);
writePng("curriculum.png", drawCurriculum);
writePng("students.png", drawStudents);
