// Test script to show what's needed for Mastercard API
console.log('=== Mastercard API Credential Check ===\n');

console.log('✓ Consumer Key provided:');
console.log('  Production: 8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e334d994fc924ed6bba81a28ae90399f0000000000000000');
console.log('  Expires: December 13th, 2025\n');

console.log('✗ Still needed: Private Key');
console.log('  The private key is required to sign OAuth 1.0a requests.\n');

console.log('To get your private key:');
console.log('1. Go to your Mastercard Developers project');
console.log('2. Download the .p12 certificate file');
console.log('3. You\'ll need:');
console.log('   - The .p12 file');
console.log('   - The keystore password you set when creating it');
console.log('   - The keystore alias (usually shown when downloading)\n');

console.log('You can either:');
console.log('A) Provide the .p12 file + password + alias');
console.log('B) Convert it to PEM format using:');
console.log('   openssl pkcs12 -in your-certificate.p12 -out private-key.pem -nocerts -nodes');
console.log('   Then provide the contents of private-key.pem');
