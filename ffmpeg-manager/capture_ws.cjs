const { WebSocket } = require('ws');
const fs = require('fs');

const wsUrl = process.argv[2];
const outFile = process.argv[3] || '/tmp/test_stream.fmp4';

if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

console.log(`Connecting to: ${wsUrl.substring(0, 80)}...`);

const ws = new WebSocket(wsUrl);
let bytes = 0;
let chunks = 0;

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  fs.appendFileSync(outFile, data);
  bytes += data.length;
  chunks++;
  if (chunks % 10 === 0) {
    console.log(`Received ${chunks} chunks, ${bytes} bytes`);
  }
});

ws.on('close', () => {
  console.log(`Closed. Total: ${chunks} chunks, ${bytes} bytes`);
  process.exit(0);
});

ws.on('error', (err) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log(`Timeout. Total: ${chunks} chunks, ${bytes} bytes`);
  ws.close();
}, 10000);
