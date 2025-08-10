import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function edgeCaseTest() {
  console.log('\n============================================================');
  console.log('EDGE CASE VALIDATION');
  console.log('============================================================\n');

  const edgeCases = [
    // Special characters
    { name: 'O\'Reilly Auto Parts', expected: 'Business' },
    { name: 'AT&T Inc.', expected: 'Business' },
    { name: 'Smith & Sons, LLC', expected: 'Business' },
    { name: '3M Company', expected: 'Business' },
    
    // International names
    { name: 'François Müller', expected: 'Individual' },
    { name: 'José García', expected: 'Individual' },
    { name: '北京科技有限公司', expected: 'Business' },
    
    // Ambiguous cases
    { name: 'Morgan Stanley', expected: 'Business' },
    { name: 'Wells Fargo', expected: 'Business' },
    { name: 'Chase Bank', expected: 'Business' },
    
    // Government variants
    { name: 'IRS', expected: 'Government' },
    { name: 'Department of Defense', expected: 'Government' },
    { name: 'City of Los Angeles', expected: 'Government' },
    
    // Edge length cases
    { name: 'A', expected: 'Individual' },
    { name: 'IBM', expected: 'Business' },
    { name: 'The Very Long Company Name That Goes On And On Corporation LLC', expected: 'Business' }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of edgeCases) {
    try {
      const res = await fetch(`${API_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payee: testCase.name })
      }).then(r => r.json());

      if (res.classification?.payeeType === testCase.expected) {
        console.log(`✅ "${testCase.name}" → ${res.classification.payeeType} (${(res.classification.confidence*100).toFixed(0)}%)`);
        passed++;
      } else {
        console.log(`❌ "${testCase.name}" → Expected ${testCase.expected}, got ${res.classification?.payeeType || 'error'}`);
        failed++;
      }
    } catch (e) {
      console.log(`❌ "${testCase.name}" → Error: ${e.message}`);
      failed++;
    }
  }

  console.log('\n============================================================');
  console.log(`Edge Cases: ${passed}/${edgeCases.length} passed (${(passed/edgeCases.length*100).toFixed(1)}%)`);
  
  return { passed, failed };
}

edgeCaseTest().catch(console.error);
