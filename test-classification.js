// Test script to verify classification is working
const fs = require('fs');

// Create a small test CSV
const testData = `Supplier Name,Amount,Date
John Smith,100.00,2025-01-01
Acme Corp LLC,250.00,2025-01-02
City of New York,500.00,2025-01-03
Jane Doe,75.00,2025-01-04
Microsoft Corporation,1000.00,2025-01-05
Department of Transportation,300.00,2025-01-06
Bob's Plumbing Services,150.00,2025-01-07
Sarah Johnson,200.00,2025-01-08
Amazon Inc,450.00,2025-01-09
County of Los Angeles,600.00,2025-01-10
IBM CORP,800.00,2025-01-11
Dr. Michael Brown,125.00,2025-01-12
Apple Inc.,2000.00,2025-01-13
State of California,700.00,2025-01-14
Johnson & Associates LLC,350.00,2025-01-15`;

fs.writeFileSync('test-classification.csv', testData);
console.log('Created test-classification.csv with 15 diverse payees');
console.log('This file includes:');
console.log('- Individuals: John Smith, Jane Doe, Sarah Johnson, Dr. Michael Brown');
console.log('- Businesses: Acme Corp LLC, Microsoft Corporation, Bob\'s Plumbing Services, Amazon Inc, IBM CORP, Apple Inc., Johnson & Associates LLC');
console.log('- Government: City of New York, Department of Transportation, County of Los Angeles, State of California');