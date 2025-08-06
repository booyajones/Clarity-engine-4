import fetch from 'node-fetch';

async function checkMastercardStatus() {
  console.log('\n📊 Checking Mastercard Search Status...\n');
  
  const response = await fetch('http://localhost:5000/api/mastercard/monitor', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  
  // Count statuses
  const statusCounts = {};
  data.searches.forEach(search => {
    statusCounts[search.status] = (statusCounts[search.status] || 0) + 1;
  });

  console.log('Status Summary:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    const emoji = status === 'completed' ? '✅' : 
                  status === 'failed' ? '❌' : 
                  status === 'timeout' ? '⏱️' : '⏳';
    console.log(`  ${emoji} ${status}: ${count}`);
  });

  // Show recent searches
  console.log('\nRecent Searches (last 10):');
  const recent = data.searches.slice(0, 10);
  
  recent.forEach(search => {
    const emoji = search.status === 'completed' ? '✅' : 
                  search.status === 'failed' ? '❌' : 
                  search.status === 'timeout' ? '⏱️' : '⏳';
    const time = new Date(search.submittedAt).toLocaleTimeString();
    const request = search.requestPayload;
    const payeeName = request?.searches?.[0]?.name || 'Unknown';
    
    console.log(`  ${emoji} ${payeeName} - ${search.status} (${time})`);
    
    if (search.status === 'completed' && search.responsePayload) {
      const results = search.responsePayload.results;
      if (results && results.length > 0) {
        const merchant = results[0];
        console.log(`     → Found: ${merchant.DBA_NAME || merchant.LEGAL_NAME}`);
        console.log(`     → Tax ID: ${merchant.TAX_ID || 'N/A'}`);
        console.log(`     → MCC: ${merchant.MCC_CODE || 'N/A'}`);
      }
    }
  });
  
  console.log(`\nTotal searches: ${data.searches.length}`);
}

checkMastercardStatus().catch(console.error);