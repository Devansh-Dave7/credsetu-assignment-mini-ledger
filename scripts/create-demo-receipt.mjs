import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const svg = `<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
<rect width="800" height="1000" fill="white"/>
<g fill="#163d34" font-family="Arial">
<text x="70" y="140" font-size="48">MiniLedger receipt</text>
<text x="70" y="230" font-size="30">FABRICATED DEMO DATA</text>
<text x="70" y="400" font-size="34">Friend: Rahul</text>
<text x="70" y="480" font-size="34">Amount lent: INR 1,000.10</text>
<text x="70" y="650" font-size="24">For assignment testing only</text>
</g></svg>`;
await sharp(Buffer.from(svg)).jpeg().toFile('artifacts/demo-receipt.jpg');
console.log('Created artifacts/demo-receipt.jpg (fabricated test data).');
