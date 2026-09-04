const { WebSocket } = require('ws');
const fs = require('fs');

const wsUrl = process.argv[2];
const outDir = process.argv[3] || '/tmp/ws_capture';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log(`Connecting to: ${wsUrl.substring(0, 80)}...`);

const ws = new WebSocket(wsUrl);
let msgIndex = 0;
let textMsgs = [];
let binBytes = 0;
let binChunks = 0;

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    const fname = `${outDir}/frame_${String(msgIndex).padStart(4, '0')}.bin`;
    fs.writeFileSync(fname, data);
    binBytes += data.length;
    binChunks++;
    if (binChunks <= 5 || binChunks % 10 === 0) {
      console.log(`Binary msg #${msgIndex}: ${data.length} bytes, first 8: ${data.slice(0, 8).toString('hex')}`);
    }
  } else {
    const text = data.toString();
    textMsgs.push(text);
    console.log(`Text msg #${msgIndex}: ${text.substring(0, 200)}`);
    fs.writeFileSync(`${outDir}/msg_${msgIndex}.json`, text);
  }
  msgIndex++;
});

ws.on('close', (code) => {
  console.log(`\nClosed (code=${code}). Total: ${msgIndex} messages, ${binChunks} binary chunks, ${binBytes} bytes`);
  fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify({
    totalMessages: msgIndex,
    textMessages: textMsgs.length,
    binaryChunks: binChunks,
    binaryBytes: binBytes,
    textContent: textMsgs
  }, null, 2));
  process.exit(0);
});

ws.on('error', (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log(`\nTimeout. Closing...`);
  ws.close();
}, 15000);
