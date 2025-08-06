#!/usr/bin/env node

// Quick test to verify searchRequestId format is alphanumeric only

// Generate the same format as in mastercardApi.ts
const searchRequestId = `single${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

console.log('\n=== SearchRequestId Format Test ===');
console.log('Generated ID:', searchRequestId);
console.log('Length:', searchRequestId.length);
console.log('Is alphanumeric only:', /^[a-zA-Z0-9]+$/.test(searchRequestId));
console.log('Contains underscores:', searchRequestId.includes('_'));
console.log('Contains hyphens:', searchRequestId.includes('-'));

// Test multiple generations
console.log('\nGenerating 5 more IDs to verify consistency:');
for (let i = 0; i < 5; i++) {
  const id = `single${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  console.log(`  ${i + 1}. ${id} - Valid: ${/^[a-zA-Z0-9]+$/.test(id)}`);
}

console.log('\n✅ All IDs should be alphanumeric only (no underscores, hyphens, or special chars)');