import fs from 'fs';

// Generate a CSV with 1000 payees
const headers = 'Supplier Name,Total Invoiced $,Address 1,Address 2,City,State,Zip\n';
let data = headers;

const companies = [
  'Acme Corporation', 'Global Tech Solutions', 'Prime Manufacturing LLC',
  'Eastern Trading Co', 'Western Supply Inc', 'Northern Industries',
  'Southern Logistics', 'Central Services', 'Pacific Imports',
  'Atlantic Exports', 'Mountain View Systems', 'Valley Enterprises'
];

const cities = [
  { name: 'New York', state: 'NY', zip: '10001' },
  { name: 'Los Angeles', state: 'CA', zip: '90001' },
  { name: 'Chicago', state: 'IL', zip: '60601' },
  { name: 'Houston', state: 'TX', zip: '77001' },
  { name: 'Phoenix', state: 'AZ', zip: '85001' },
  { name: 'Philadelphia', state: 'PA', zip: '19101' },
  { name: 'San Antonio', state: 'TX', zip: '78201' },
  { name: 'San Diego', state: 'CA', zip: '92101' },
  { name: 'Dallas', state: 'TX', zip: '75201' },
  { name: 'San Jose', state: 'CA', zip: '95101' }
];

for (let i = 0; i < 1000; i++) {
  const company = companies[Math.floor(Math.random() * companies.length)] + ' ' + i;
  const amount = (Math.random() * 10000).toFixed(2);
  const city = cities[Math.floor(Math.random() * cities.length)];
  const address = `${Math.floor(Math.random() * 9999) + 1} Main St`;
  
  data += `${company},$${amount},${address},,${city.name},${city.state},${city.zip}\n`;
}

fs.writeFileSync('test-large.csv', data);
console.log('Created test-large.csv with 1000 records');