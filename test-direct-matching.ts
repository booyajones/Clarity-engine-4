import { AccurateMatchingService } from './server/services/accurateMatchingService';

async function testDirectMatching() {
  const service = new AccurateMatchingService();
  
  const testNames = [
    'GRAY MEDIA GROUP INC',
    'Gray Media Group Inc.',
    'Gray Media Group Inc',
    'MED LIFE SERVICES',
    'MA Exhaust Tech LLC',
    'FIRE SERVICE INC.'
  ];
  
  console.log('Testing AccurateMatchingService directly...\n');
  
  for (const name of testNames) {
    console.log(`Testing: "${name}"`);
    const result = await service.findBestMatch(name, 5);
    
    if (result.bestMatch) {
      console.log(`  ✅ Found: "${result.bestMatch.payeeName}" (${Math.round(result.confidence * 100)}%)`);
    } else {
      console.log(`  ❌ No match found`);
    }
  }
  
  process.exit(0);
}

testDirectMatching().catch(console.error);
