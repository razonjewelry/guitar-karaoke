// מחולל אייקונים (ללא תלויות): ריבוע כהה ופיק גיטרה זהוב. הרצה: node tools/gen-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// פיק = משולש מעוגל: נקודה "בפנים" אם המרחק למשולש הפנימי <= r
const A = [0.5, 0.80], B = [0.28, 0.30], C = [0.72, 0.30], R = 0.085;
function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function inTri(p) {
  const d1 = cross(A, B, p), d2 = cross(B, C, p), d3 = cross(C, A, p);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function inPick(p) {
  if (inTri(p)) return true;
  return Math.min(distSeg(p, A, B), distSeg(p, B, C), distSeg(p, C, A)) <= R;
}
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [14, 16, 20], gold = [230, 188, 98], hole = [14, 16, 20];
  const SS = 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let g = 0, h = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const p = [(x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size];
      if (inPick(p)) { g++; if (Math.hypot(p[0] - 0.5, p[1] - 0.46) < 0.07) h++; }
    }
    const gi = g / (SS * SS), hi = h / (SS * SS);
    for (let k = 0; k < 3; k++) {
      let v = bg[k] * (1 - gi) + gold[k] * gi;
      v = v * (1 - hi) + hole[k] * hi;
      px[(y * size + x) * 4 + k] = Math.round(v);
    }
    px[(y * size + x) * 4 + 3] = 255;
  }
  return png(size, px);
}

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
[192, 512].forEach((s) => fs.writeFileSync(path.join(dir, 'icon-' + s + '.png'), draw(s)));
console.log('wrote icons/icon-192.png, icon-512.png');
