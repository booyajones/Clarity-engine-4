import fs from 'fs';

function generateLargeDataset() {
  console.log('Generating large test dataset...');
  
  const companies = [
    'Acme Corporation', 'Global Industries LLC', 'Tech Solutions Inc',
    'Smith Enterprises', 'Johnson & Associates', 'Brown Manufacturing',
    'Davis Holdings', 'Miller Group', 'Wilson Systems', 'Moore Technologies',
    'Taylor Services', 'Anderson Corp', 'Thomas Industries', 'Jackson LLC',
    'White Consulting', 'Harris Solutions', 'Martin Enterprises', 'Thompson Group',
    'Garcia Industries', 'Martinez Corp', 'Robinson LLC', 'Clark Systems',
    'Rodriguez Manufacturing', 'Lewis Holdings', 'Lee Technologies', 'Walker Group'
  ];
  
  const streets = ['Main St', 'Oak Ave', 'Elm Dr', 'Park Blvd', 'First Ave', 'Second St'];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'];
  const states = ['NY', 'CA', 'IL', 'TX', 'AZ', 'PA'];
  
  let csv = 'Company Name,Address,City,State,Zip\n';
  
  for (let i = 0; i < 1000; i++) {
    const company = companies[Math.floor(Math.random() * companies.length)] + ' ' + i;
    const address = Math.floor(Math.random() * 9999) + ' ' + streets[Math.floor(Math.random() * streets.length)];
    const cityIdx = Math.floor(Math.random() * cities.length);
    const city = cities[cityIdx];
    const state = states[cityIdx];
    const zip = 10000 + Math.floor(Math.random() * 89999);
    
    csv += `"${company}","${address}","${city}","${state}","${zip}"\n`;
  }
  
  fs.writeFileSync('large-test-1000.csv', csv);
  console.log('Created large-test-1000.csv with 1000 records');
}

generateLargeDataset();
