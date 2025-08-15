import fs from 'fs';

// Arrays of sample data for generating realistic records
const companies = [
  'Walmart', 'Amazon', 'Apple', 'Microsoft', 'Google', 'Tesla', 'Nike', 'Adidas', 'McDonald\'s', 'Starbucks',
  'Target', 'Home Depot', 'Costco', 'CVS Health', 'Walgreens', 'Best Buy', 'Kroger', 'Lowe\'s', 'FedEx', 'UPS',
  'AT&T', 'Verizon', 'T-Mobile', 'Sprint', 'Comcast', 'Disney', 'Netflix', 'Spotify', 'Adobe', 'Oracle',
  'IBM', 'Intel', 'AMD', 'NVIDIA', 'PayPal', 'Square', 'Visa', 'Mastercard', 'American Express', 'Chase',
  'Wells Fargo', 'Bank of America', 'Citibank', 'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'State Farm', 'Allstate', 'Progressive', 'GEICO'
];

const suffixes = ['Inc', 'LLC', 'Corporation', 'Corp', 'Company', 'Co', 'Group', 'Holdings', 'Partners', 'Services'];

const streets = [
  'Main St', 'Broadway', 'Market St', 'Oak Ave', 'Pine St', 'Elm St', 'Washington Blvd', 'Jefferson Ave', 
  'Madison Ave', 'Lincoln Way', 'Park Ave', 'First St', 'Second Ave', 'Third St', 'Fourth Ave', 
  'Fifth St', 'Sixth Ave', 'Seventh St', 'Eighth Ave', 'Ninth St', 'Tenth Ave',
  'Industrial Pkwy', 'Commerce Dr', 'Business Park Dr', 'Tech Center Way', 'Innovation Blvd'
];

const cities = [
  { name: 'New York', state: 'NY', zips: ['10001', '10002', '10003', '10004', '10005'] },
  { name: 'Los Angeles', state: 'CA', zips: ['90001', '90002', '90003', '90004', '90005'] },
  { name: 'Chicago', state: 'IL', zips: ['60601', '60602', '60603', '60604', '60605'] },
  { name: 'Houston', state: 'TX', zips: ['77001', '77002', '77003', '77004', '77005'] },
  { name: 'Phoenix', state: 'AZ', zips: ['85001', '85002', '85003', '85004', '85005'] },
  { name: 'Philadelphia', state: 'PA', zips: ['19101', '19102', '19103', '19104', '19105'] },
  { name: 'San Antonio', state: 'TX', zips: ['78201', '78202', '78203', '78204', '78205'] },
  { name: 'San Diego', state: 'CA', zips: ['92101', '92102', '92103', '92104', '92105'] },
  { name: 'Dallas', state: 'TX', zips: ['75201', '75202', '75203', '75204', '75205'] },
  { name: 'San Jose', state: 'CA', zips: ['95101', '95102', '95103', '95104', '95105'] },
  { name: 'Austin', state: 'TX', zips: ['78701', '78702', '78703', '78704', '78705'] },
  { name: 'Jacksonville', state: 'FL', zips: ['32201', '32202', '32203', '32204', '32205'] },
  { name: 'Fort Worth', state: 'TX', zips: ['76101', '76102', '76103', '76104', '76105'] },
  { name: 'Columbus', state: 'OH', zips: ['43201', '43202', '43203', '43204', '43205'] },
  { name: 'Charlotte', state: 'NC', zips: ['28201', '28202', '28203', '28204', '28205'] },
  { name: 'San Francisco', state: 'CA', zips: ['94101', '94102', '94103', '94104', '94105'] },
  { name: 'Indianapolis', state: 'IN', zips: ['46201', '46202', '46203', '46204', '46205'] },
  { name: 'Seattle', state: 'WA', zips: ['98101', '98102', '98103', '98104', '98105'] },
  { name: 'Denver', state: 'CO', zips: ['80201', '80202', '80203', '80204', '80205'] },
  { name: 'Boston', state: 'MA', zips: ['02101', '02102', '02103', '02104', '02105'] }
];

const firstNames = [
  'John', 'Jane', 'Michael', 'Sarah', 'David', 'Lisa', 'Robert', 'Mary', 'James', 'Jennifer',
  'William', 'Patricia', 'Richard', 'Linda', 'Joseph', 'Barbara', 'Thomas', 'Elizabeth', 'Charles', 'Susan'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
];

// Generate records
const records = [];

for (let i = 0; i < 1000; i++) {
  const recordType = Math.random();
  let payeeName;
  
  if (recordType < 0.7) {
    // 70% businesses
    const company = companies[Math.floor(Math.random() * companies.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    payeeName = `${company} ${suffix}`;
  } else {
    // 30% individuals
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    payeeName = `${firstName} ${lastName}`;
  }
  
  // Generate address
  const streetNum = Math.floor(Math.random() * 9999) + 1;
  const street = streets[Math.floor(Math.random() * streets.length)];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const zip = city.zips[Math.floor(Math.random() * city.zips.length)];
  
  records.push({
    'Payee Name': payeeName,
    'address': `${streetNum} ${street}`,
    'city': city.name,
    'state': city.state,
    'zip_code': zip
  });
}

// Convert to CSV
const headers = ['Payee Name', 'address', 'city', 'state', 'zip_code'];
const csvContent = [
  headers.join(','),
  ...records.map(record => 
    headers.map(header => {
      const value = record[header];
      // Escape values with commas
      return value.includes(',') ? `"${value}"` : value;
    }).join(',')
  )
].join('\n');

// Write to file
fs.writeFileSync('test-1000-records.csv', csvContent);
console.log('Generated test-1000-records.csv with 1000 records');
console.log('File size:', (csvContent.length / 1024).toFixed(2), 'KB');