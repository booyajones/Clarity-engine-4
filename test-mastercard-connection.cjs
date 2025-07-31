// Test script to verify Mastercard API connection
const crypto = require('crypto');

// Test credentials format
console.log('Testing Mastercard API credential format...\n');

const testKey = 'wuidhqwuie327476357cgqjhdg26t';
const testPwd = 'vnvjfjh737847635h5h3';

console.log('Provided credentials:');
console.log('KEY length:', testKey.length, 'characters');
console.log('PWD length:', testPwd.length, 'characters');
console.log('\nExpected Mastercard credential format:');
console.log('1. Consumer Key: Usually 32+ character alphanumeric string');
console.log('2. Private Key: PEM format starting with "-----BEGIN RSA PRIVATE KEY-----"');
console.log('3. Or P12 certificate with alias and password');

console.log('\nFor Mastercard Track Search API, you typically need one of these:');
console.log('\nOption 1 - OAuth 1.0a with RSA:');
console.log('- Consumer Key (from Mastercard Developers portal)');
console.log('- Private Key in PEM format');

console.log('\nOption 2 - P12 Certificate:');
console.log('- Consumer Key');
console.log('- P12 file');
console.log('- Keystore alias (e.g., "keyalias")');
console.log('- Keystore password');

console.log('\nThe credentials you provided appear to be in a different format.');
console.log('Could you check if you have:');
console.log('1. A .p12 certificate file from Mastercard?');
console.log('2. Or a private key that starts with "-----BEGIN RSA PRIVATE KEY-----"?');