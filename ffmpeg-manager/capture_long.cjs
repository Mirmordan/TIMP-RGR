const { WebSocket } = require('ws');
const fs = require('fs');

const wsUrl = process.argv[2];
const outFile = process.argv[3] || '/tmp/test_stream.fmp4';
const timeout = parseInt(process.argv[4]) || 15000;

if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

console.log(`Connecting to: ${wsUrl.substring(0, 80)}...`);

const ws = new WebSocket(wsUrl);
let bytes = 0;
let chunks = 0;

ws.on('open', () => {
  console.log('Connected');
  // Send a ping or subscribe message if needed
});

ws.on('message', (data, isBinary) => {
  fs.appendFileSync(outFile, data);
  bytes += data.length;
  chunks++;
  if (chunks % 50 === 0) {
    console.log(`Received ${chunks} chunks, ${bytes} bytes`);
  }
});

ws.on('close', (code, reason) => {
  console.log(`Closed (code=${code}). Total: ${chunks} chunks, ${bytes} bytes`);
  process.exit(0);
});

ws.on('error', (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log(`Timeout after ${timeout}ms. Total: ${chunks} chunks, ${bytes} bytes`);
  ws.close();
}, timeout);
