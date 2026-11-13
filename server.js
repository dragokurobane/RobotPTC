/**
 * Robot Arena LAN server  (no npm install needed — only Node.js is required)
 *
 *   node server.js            -> http://<this-computer-IP>:3000
 *
 *  - Serves this folder (index.html, display.html, images, ...)
 *  - Relays the controller <-> projector messages between ALL computers on the
 *    same network (Server-Sent Events + POST), so the projector page can run on
 *    another computer, a tablet, or an OBS Browser Source.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
// Optional shared password. When set (e.g. on Render), /events and /emit require ?key=<ACCESS_KEY>
// so strangers who find the website address cannot control or read your scoreboard.
const ACCESS_KEY = process.env.ACCESS_KEY || '';
const ON_RENDER = !!process.env.RENDER;

function keyOk(url) {
  if (!ACCESS_KEY) return true;
  const given = Buffer.from(url.searchParams.get('key') || '');
  const wanted = Buffer.from(ACCESS_KEY);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json; charset=utf-8'
};

const clients = new Set();

function broadcastRaw(chunk) {
  for (const res of clients) {
    try { res.write(chunk); } catch (e) { clients.delete(res); }
  }
}

function broadcastPresence() {
  broadcastRaw(`event: presence\ndata: ${JSON.stringify({ count: clients.size })}\n\n`);
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 1000\n\n');
  clients.add(res);
  broadcastPresence();
  req.on('close', () => {
    clients.delete(res);
    broadcastPresence();
  });
}

function handleEmit(req, res) {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > 256 * 1024) { res.writeHead(413); res.end(); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    try {
      const msg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!msg || typeof msg.type !== 'string') throw new Error('bad message');
      // one line per SSE event: JSON.stringify never emits raw newlines
      broadcastRaw(`data: ${JSON.stringify(msg)}\n\n`);
      res.writeHead(204);
      res.end();
    } catch (e) {
      res.writeHead(400);
      res.end();
    }
  });
}

function handleStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.normalize(path.join(ROOT, rel));
  const ext = path.extname(filePath).toLowerCase();
  const inRoot = filePath === ROOT || filePath.startsWith(ROOT + path.sep);
  const isHidden = path.basename(filePath).startsWith('.');

  // only serve known web file types from this folder (not server.js / package.json etc.)
  const isServerFile = path.dirname(filePath) === ROOT && path.basename(filePath).toLowerCase() === 'server.js';
  if (!inRoot || isHidden || isServerFile || !MIME[ext] || ext === '.json') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if ((pathname === '/events' || pathname === '/emit') && !keyOk(url)) {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Unauthorized: add ?key=YOUR_ACCESS_KEY to the address');
  }
  if (req.method === 'GET' && pathname === '/events') return handleEvents(req, res);
  if (req.method === 'POST' && pathname === '/emit') return handleEmit(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return handleStatic(req, res, pathname);

  res.writeHead(405);
  res.end();
});

// keep SSE connections alive through routers / proxies
setInterval(() => broadcastRaw(': ping\n\n'), 15000);

server.listen(PORT, '0.0.0.0', () => {
  if (ON_RENDER) {
    console.log('Robot Arena server is running on Render (port ' + PORT + ')');
    console.log(ACCESS_KEY ? 'ACCESS_KEY is ON: open the site with ?key=<your key>' : 'ACCESS_KEY is OFF: anyone with the address can control the scoreboard');
    return;
  }
  const addrs = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
    });
  });

  console.log('');
  console.log('==============================================');
  console.log('  ROBOT ARENA LAN SERVER  (ครั้งที่ 5)');
  console.log('==============================================');
  console.log('');
  console.log('  เครื่องนี้ (หน้าควบคุม):');
  console.log(`    http://localhost:${PORT}/`);
  console.log('');
  if (addrs.length === 0) {
    console.log('  ไม่พบเครือข่าย LAN/Wi-Fi — ต่อเครือข่ายก่อน แล้วเปิดโปรแกรมใหม่');
  } else {
    console.log('  เครื่องอื่น / OBS (หน้าโปรเจกเตอร์):');
    addrs.forEach((ip) => console.log(`    http://${ip}:${PORT}/display.html`));
  }
  console.log('');
  if (ACCESS_KEY) console.log('  ACCESS_KEY เปิดอยู่: ต่อท้ายที่อยู่ด้วย ?key=รหัสของคุณ');
  console.log('  กด Ctrl+C เพื่อปิดเซิร์ฟเวอร์');
  console.log('');
});
