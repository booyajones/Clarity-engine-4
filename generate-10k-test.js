import fs from 'fs';

const headers = 'Payee Name,Amount,Type\n';
let data = headers;

const companies = ['Tech Solutions', 'Global Services', 'Prime Industries', 'Alpha Corp', 'Beta LLC'];
const individuals = ['John Smith', 'Jane Doe', 'Robert Johnson', 'Mary Williams'];

for (let i = 0; i < 10000; i++) {
  let name;
  if (i % 3 === 0) {
    name = companies[i % companies.length] + ' ' + i + ' LLC';
  } else if (i % 10 === 0) {
    name = 'Department of ' + ['Health', 'Education', 'Transportation'][i % 3] + ' ' + i;
  } else {
    name = individuals[i % individuals.length] + ' ' + i;
  }
  
  const amount = (Math.random() * 50000).toFixed(2);
  const type = ['Payment', 'Invoice', 'Reimbursement'][i % 3];
  
  data += `"${name}",$${amount},${type}\n`;
}

fs.writeFileSync('test-10k.csv', data);
console.log('Created test-10k.csv with 10,000 records');
