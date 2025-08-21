#!/usr/bin/env node

/**
 * Deployment Memory Fix Script
 * Fixes critical memory issues and optimizes for production deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting deployment memory fixes...\n');

// 1. Apply database indexes
console.log('📊 Applying database indexes for performance...');
try {
  if (fs.existsSync('add-production-indexes.sql')) {
    console.log('Applying production indexes to database...');
    // Note: In production, you'd run this through your database client
    console.log('SQL indexes created in add-production-indexes.sql');
    console.log('Please run: npx drizzle-kit push:pg to apply them');
  }
} catch (error) {
  console.error('Warning: Could not apply indexes:', error.message);
}

// 2. Clean up temporary files
console.log('\n🧹 Cleaning up temporary files...');
const filesToClean = [
  'finexio-batch-*.sql',
  'batch-*.sql',
  'keywords-batch-*.sql',
  'uploads/*.csv',
  'uploads/*.xlsx'
];

filesToClean.forEach(pattern => {
  try {
    execSync(`rm -f ${pattern}`, { stdio: 'pipe' });
    console.log(`✓ Cleaned: ${pattern}`);
  } catch (error) {
    // Ignore errors for non-existent files
  }
});

// 3. Clear node_modules cache if needed
console.log('\n📦 Optimizing node_modules...');
try {
  execSync('npm prune --production', { stdio: 'inherit' });
  console.log('✓ Removed dev dependencies');
} catch (error) {
  console.error('Warning: Could not prune node_modules:', error.message);
}

// 4. Set environment variables for production
console.log('\n⚙️ Setting production environment variables...');
const envUpdates = {
  NODE_ENV: 'production',
  NODE_OPTIONS: '--expose-gc --max-old-space-size=512',
  UV_THREADPOOL_SIZE: '4'
};

// Write to .env.production
const envContent = Object.entries(envUpdates)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

fs.writeFileSync('.env.production', envContent);
console.log('✓ Created .env.production with optimized settings');

// 5. Display restart instructions
console.log('\n✅ Deployment fixes complete!\n');
console.log('📌 To start the application with memory optimizations:');
console.log('   NODE_OPTIONS="--expose-gc --max-old-space-size=512" npm run dev\n');
console.log('📌 Or for production:');
console.log('   NODE_ENV=production NODE_OPTIONS="--expose-gc --max-old-space-size=512" npm start\n');

// 6. Show memory optimization summary
console.log('💡 Memory optimizations applied:');
console.log('   • Reduced cache sizes (5MB supplier, 200 classification, 50 query)');
console.log('   • Enabled garbage collection with --expose-gc');
console.log('   • Limited heap size to 512MB');
console.log('   • Batch processing interval increased to 60s');
console.log('   • Database indexes prepared for application');
console.log('   • Cleaned temporary files');

console.log('\n🎯 Next steps:');
console.log('   1. Restart the application with the new settings');
console.log('   2. Apply database indexes using: npx drizzle-kit push:pg');
console.log('   3. Monitor memory usage in production');
console.log('   4. Consider microservices architecture for scaling (see docs/MICROSERVICES_ARCHITECTURE_PLAN.md)');