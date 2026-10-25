#!/usr/bin/env node
/**
 * Generate a SHA256 hash for a token to use in AGENT_KEYS
 * Usage: node gen_cloudflare_key.js your_token
 */

import crypto from 'crypto';

const token = process.argv[2];

if (!token) {
  console.error('Usage: node gen_cloudflare_key.js <token>');
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(token).digest('hex');

console.log('Token:', token);
console.log('SHA256 Hash:', hash);
console.log('\nAdd to AGENT_KEYS environment variable:');
console.log(JSON.stringify({
  agent_name: {
    key_sha256: hash,
    scopes: ['calendar:read', 'calendar:write'],
  },
}, null, 2));
