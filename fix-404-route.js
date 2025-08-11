// This script will show us where the 404 is coming from
const fetch = require('node-fetch');

async function test404() {
  try {
    // Test the root path
    const res = await fetch('http://localhost:5000/');
    console.log('Root path status:', res.status);
    
    // Test API health
    const health = await fetch('http://localhost:5000/api/health');
    console.log('Health API status:', health.status);
    
  } catch (error) {
    console.error('Error testing routes:', error.message);
  }
}

test404();
