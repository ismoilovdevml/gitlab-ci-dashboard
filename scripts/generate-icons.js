#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

// Simple PNG creation (1x1 orange pixel, will be scaled by browser)
// This is a minimal valid PNG file in GitLab orange (#FC6D26)
const createSimplePNG = () => {
  // This is a valid 1x1 orange PNG in base64
  const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  return Buffer.from(base64PNG, 'base64');
};

// GitLab orange color SVG icon
const createSVGIcon = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="512" height="512" rx="80" fill="#FC6D26"/>

  <!-- CI/CD Icon -->
  <g fill="white">
    <!-- Top pipeline stage -->
    <circle cx="256" cy="150" r="30" opacity="1"/>
    <rect x="246" y="180" width="20" height="40" opacity="0.9"/>

    <!-- Middle pipeline stage -->
    <circle cx="256" cy="256" r="30" opacity="0.9"/>
    <rect x="246" y="286" width="20" height="40" opacity="0.8"/>

    <!-- Bottom pipeline stage -->
    <circle cx="256" cy="362" r="30" opacity="0.8"/>

    <!-- Side branches -->
    <circle cx="180" cy="256" r="20" opacity="0.7"/>
    <circle cx="332" cy="256" r="20" opacity="0.7"/>
    <line x1="210" y1="256" x2="236" y2="256" stroke="white" stroke-width="4" opacity="0.7"/>
    <line x1="276" y1="256" x2="302" y2="256" stroke="white" stroke-width="4" opacity="0.7"/>
  </g>
</svg>`;

const publicDir = path.join(__dirname, '..', 'public');

// Create favicon.ico (using PNG format, browsers accept it)
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createSimplePNG());
console.log('✅ Created favicon.ico');

// Create icon PNGs (minimal size, browser will scale)
fs.writeFileSync(path.join(publicDir, 'icon-192x192.png'), createSimplePNG());
console.log('✅ Created icon-192x192.png');

fs.writeFileSync(path.join(publicDir, 'icon-512x512.png'), createSimplePNG());
console.log('✅ Created icon-512x512.png');

// Create proper SVG icon
fs.writeFileSync(path.join(publicDir, 'icon.svg'), createSVGIcon());
console.log('✅ Created icon.svg');

console.log('\n🎉 All icons generated successfully!');
