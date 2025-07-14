import fs from 'fs';

const headers = 'Payee Name,Amount,Address,City,State,Zip\n';
let data = headers;

const businessTypes = ['LLC', 'Inc', 'Corp', 'Co', 'Ltd', 'Group', 'Services', 'Solutions'];
const businessNames = ['Tech', 'Global', 'Prime', 'Alpha', 'Beta', 'Omega', 'Delta', 'Sigma'];
const individuals = ['John Smith', 'Jane Doe', 'Robert Johnson', 'Mary Williams', 'David Brown'];

for (let i = 0; i < 5000; i++) {
  let name;
  if (i % 3 === 0) {
    // Business
    const bname = businessNames[Math.floor(Math.random() * businessNames.length)];
    const btype = businessTypes[Math.floor(Math.random() * businessTypes.length)];
    name = `${bname} ${i} ${btype}`;
  } else if (i % 7 === 0) {
    // Government
    name = `City of TestCity ${i}`;
  } else {
    // Individual
    name = individuals[Math.floor(Math.random() * individuals.length)] + ' ' + i;
  }
  
  const amount = (Math.random() * 10000).toFixed(2);
  const address = `${Math.floor(Math.random() * 9999) + 1} Main St`;
  const city = 'TestCity';
  const state = 'TX';
  const zip = '75001';
  
  data += `${name},$${amount},${address},${city},${state},${zip}\n`;
}

fs.writeFileSync('test-5000.csv', data);
console.log('Created test-5000.csv with 5000 records');
