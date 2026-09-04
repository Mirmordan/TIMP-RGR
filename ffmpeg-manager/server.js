import express from 'express';
import { spawn, execSync } from 'child_process';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { mkdirSync, readdirSync, statSync, rmSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import http from 'http';
import https from 'https';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 9999;
const RECORD_ROOT = process.env.RECORD_ROOT || '/data/chunks';
const paths = new Map();

function timestamp() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const us = String(d.getMilliseconds() * 1000).padStart(6, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}-${us}`;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getIvideonWsUrl(server, camera) {
  const url = `https://openapi-alpha.ivideon.com/cameras/${server}:${camera}/live_stream?op=GET&access_token=public&q=2&video_codecs=h264&audio_codecs=aac,mp3,pcma,pcmu,none&format=ws-fmp4&_=${Date.now()}`;
  const data = await fetchJSON(url);
  if (!data.success || !data.result?.url) throw new Error(`Ivideon API: ${JSON.stringify(data)}`);
  return data.result.url;
}

function startIvideonStream(name, opts) {
  const { server, camera, recordDir } = opts;
  let ws = null;
  let ffmpeg = null;
  let stopped = false;
  let reconnectTimer = null;
  let initSegment = null;
  let fileIndex = 0;
  let currentFfmpeg = null;
  let currentFile = null;
  let currentStream = null;

  function createNewSegment() {
    if (currentFfmpeg) {
      currentFfmpeg.stdin.end();
    }
    const fname = join(recordDir, `${timestamp()}.ts`);
    currentFile = fname;
    currentFfmpeg = spawn('ffmpeg', [
      '-f', 'mp4', '-i', 'pipe:0',
      '-c', 'copy',
      '-f', 'mpegts',
      '-y', fname
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    currentFfmpeg.stderr.on('data', () => {});
    currentFfmpeg.on('close', () => { currentFfmpeg = null; });
    return currentFfmpeg;
  }

  function connect() {
    if (stopped) return;

    getIvideonWsUrl(server, camera).then((wsUrl) => {
      console.log(`[${name}] Connecting to Ivideon WS`);
      ws = new WebSocket(wsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      initSegment = null;
      let fragBuffer = null;

      ws.on('open', () => {
        console.log(`[${name}] WS connected`);
        const p = paths.get(name);
        if (p) { p.online = true; p.ready = false; }
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          if (!initSegment) return;
          if (!currentFfmpeg) createNewSegment();
          if (currentFfmpeg && currentFfmpeg.stdin.writable) {
            currentFfmpeg.stdin.write(initSegment);
            currentFfmpeg.stdin.write(data);
          }
          const p = paths.get(name);
          if (p) { p.ready = true; p.bytesReceived += data.length; }
        } else {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'stream-init' && msg.data) {
              initSegment = Buffer.from(msg.data, 'base64');
              console.log(`[${name}] Got init segment: ${initSegment.length} bytes`);
              createNewSegment();
            } else if (msg.type === 'fragment' && msg.is_key) {
              if (currentFfmpeg && currentFfmpeg.stdin.writable) {
                currentFfmpeg.stdin.end();
              }
              setTimeout(() => createNewSegment(), 100);
            }
          } catch (e) {}
        }
      });

      ws.on('close', () => {
        console.log(`[${name}] WS closed`);
        const p = paths.get(name);
        if (p) { p.online = false; p.ready = false; }
        if (currentFfmpeg && currentFfmpeg.stdin.writable) currentFfmpeg.stdin.end();
        if (!stopped) reconnectTimer = setTimeout(connect, 3000);
      });

      ws.on('error', (err) => {
        console.log(`[${name}] WS error: ${err.message}`);
        const p = paths.get(name);
        if (p) { p.online = false; p.ready = false; }
        if (!stopped) reconnectTimer = setTimeout(connect, 5000);
      });

    }).catch((err) => {
      console.log(`[${name}] Ivideon API error: ${err.message}`);
      if (!stopped) reconnectTimer = setTimeout(connect, 5000);
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (currentFfmpeg) currentFfmpeg.kill('SIGTERM');
    }
  };
}

function startGenericStream(name, opts) {
  const { source, recordDir } = opts;
  let ffmpeg = null;
  let stopped = false;
  let restartTimer = null;

  function start() {
    if (stopped) return;
    mkdirSync(recordDir, { recursive: true });
    const filePattern = join(recordDir, `${timestamp()}_%05d.ts`);

    ffmpeg = spawn('ffmpeg', [
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
      '-i', source,
      '-c', 'copy',
      '-f', 'mpegts',
      '-segment_time', '10',
      '-y', filePattern
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('close', (code) => {
      const p = paths.get(name);
      if (p) { p.online = false; p.ready = false; }
      if (!stopped) restartTimer = setTimeout(start, 3000);
    });

    const p = paths.get(name);
    if (p) { p.online = true; p.ready = true; }
  }

  start();
  return {
    stop() {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (ffmpeg) ffmpeg.kill('SIGTERM');
    }
  };
}

// ===== API =====

app.post('/v3/config/paths/add/:name', (req, res) => {
  const { name } = req.params;
  const conf = req.body;
  if (paths.has(name)) return res.status(409).json({ status: 'error', error: 'path already exists' });

  const recordDir = join(RECORD_ROOT, name);
  mkdirSync(recordDir, { recursive: true });

  const entry = { name, conf, online: false, ready: false, source: conf.source || '', recordDir, stream: null, bytesReceived: 0 };

  if (conf._ivideon) {
    entry.stream = startIvideonStream(name, { server: conf._ivideon.server, camera: conf._ivideon.camera, recordDir });
  } else if (conf.source) {
    entry.stream = startGenericStream(name, { source: conf.source, recordDir });
  }

  paths.set(name, entry);
  res.json({ status: 'ok' });
});

app.delete('/v3/config/paths/delete/:name', (req, res) => {
  const { name } = req.params;
  const entry = paths.get(name);
  if (!entry) return res.status(404).json({ status: 'error', error: 'not found' });
  if (entry.stream) entry.stream.stop();
  paths.delete(name);
  res.json({ status: 'ok' });
});

app.get('/v3/paths/get/:name', (req, res) => {
  const entry = paths.get(req.params.name);
  if (!entry) return res.status(404).json({ status: 'error', error: 'not found' });
  const files = readdirSync(entry.recordDir).filter(f => f.endsWith('.ts')).length;
  res.json({
    name: entry.name, ready: entry.ready, online: entry.online,
    source: { type: entry.conf._ivideon ? 'ivideon' : 'hlsSource', id: '' },
    tracks: entry.ready ? ['H264'] : [], readers: [], bytesReceived: entry.bytesReceived, fileCount: files,
  });
});

app.get('/v3/paths/list', (req, res) => {
  const items = [];
  for (const [name, entry] of paths) {
    const files = readdirSync(entry.recordDir).filter(f => f.endsWith('.ts')).length;
    items.push({
      name: entry.name, ready: entry.ready, online: entry.online,
      source: { type: entry.conf._ivideon ? 'ivideon' : 'hlsSource', id: '' },
      tracks: entry.ready ? ['H264'] : [], readers: [], bytesReceived: entry.bytesReceived, fileCount: files,
    });
  }
  res.json({ itemCount: items.length, pageCount: 1, items });
});

app.get('/health', (req, res) => res.json({ status: 'ok', paths: paths.size }));

http.createServer(app).listen(PORT, () => {
  console.log(`ffmpeg-manager listening on :${PORT}, record root: ${RECORD_ROOT}`);
});
