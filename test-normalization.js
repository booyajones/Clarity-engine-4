// Test normalization for duplicate detection

function superNormalizeForDuplicates(name) {
  // Ultra-aggressive normalization for duplicate detection
  let normalized = name.toLowerCase();
  
  // Remove numbers in parentheses like (123), (211), etc.
  normalized = normalized.replace(/\s*\(\d+\)\s*/g, ' ');
  
  // First remove ALL punctuation but keep spaces
  normalized = normalized.replace(/[^\w\s]/g, ' ');
  
  // Remove common business suffixes FIRST (before removing product descriptors)
  // This ensures "Pepsi Cola Company" -> "Pepsi Cola" -> "Pepsi"
  const businessSuffixes = [
    'llc', 'incorporated', 'inc', 'corp', 'corporation', 'co', 'company', 'companies',
    'ltd', 'limited', 'lp', 'llp', 'pllc', 'plc', 'pc', 'pa',
    'enterprises', 'enterprise', 'ent', 'group', 'grp',
    'services', 'service', 'svcs', 'svc',
    'solutions', 'solution', 'soln',
    'associates', 'assoc', 'assocs',
    'partners', 'partnership', 'ptnr', 'ptr',
    'holdings', 'holding', 'hldg',
    'international', 'intl', 'global', 'worldwide',
    'systems', 'system', 'sys',
    'technologies', 'technology', 'tech',
    'industries', 'industry', 'ind',
    'consulting', 'consultants', 'consultant', 'consult',
    'management', 'mgmt', 'mgm',
    'development', 'dev', 'developers',
    'investments', 'investment', 'invest',
    'capital', 'ventures', 'venture', 'vc',
    'properties', 'property', 'prop',
    'realty', 'real estate', 'realtors',
    'trust', 'foundation', 'institute', 'institution',
    'organization', 'org', 'association', 'assn', 'assoc',
    'society', 'club', 'center', 'centre'
  ];
  
  // Create regex to remove business suffixes
  const suffixRegex = new RegExp(`\\b(${businessSuffixes.join('|')})\\b`, 'gi');
  normalized = normalized.replace(suffixRegex, ' ');
  
  // Remove common product/service descriptors that customers might add
  const productDescriptors = [
    'cola', 'soda', 'beverage', 'beverages', 'drink', 'drinks',
    'products', 'product', 'prod', 'brands', 'brand',
    'foods', 'food', 'restaurant', 'restaurants', 'resto',
    'cafe', 'coffee', 'pizza', 'burger', 'burgers',
    'bank', 'banking', 'financial', 'finance', 'insurance', 'ins',
    'agency', 'agencies',
    'store', 'stores', 'shop', 'shops', 'shopping',
    'market', 'markets', 'supermarket', 'mart',
    'pharmacy', 'drug', 'drugs', 'medical', 'health', 'healthcare',
    'gas', 'gasoline', 'fuel', 'station', 'stations', 'petroleum',
    'hotel', 'hotels', 'motel', 'motels', 'inn', 'lodge', 'resort',
    'airlines', 'airline', 'airways', 'air', 'flights', 'aviation',
    'rental', 'rentals', 'rent', 'leasing', 'lease',
    'wireless', 'mobile', 'cellular', 'phone', 'phones', 'communications', 'comm',
    'internet', 'broadband', 'cable', 'satellite', 'streaming', 'network',
    'shipping', 'freight', 'delivery', 'express', 'logistics', 'transport',
    'retail', 'wholesale', 'distribution', 'supply', 'supplies', 'supplier'
  ];
  
  // Create regex to remove these descriptors
  const descriptorRegex = new RegExp(`\\b(${productDescriptors.join('|')})\\b`, 'gi');
  normalized = normalized.replace(descriptorRegex, ' ');
  
  // Remove address-related words
  const addressWords = [
    'street', 'str', 'st', 'avenue', 'ave', 'av',
    'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr',
    'lane', 'ln', 'court', 'ct', 'place', 'pl',
    'circle', 'cir', 'highway', 'hwy', 'parkway', 'pkwy',
    'way', 'suite', 'ste', 'building', 'bldg',
    'floor', 'fl', 'unit', 'apt', 'apartment', 'room', 'rm'
  ];
  
  const addressRegex = new RegExp(`\\b(${addressWords.join('|')})\\b`, 'gi');
  normalized = normalized.replace(addressRegex, ' ');
  
  // Remove directionals
  normalized = normalized.replace(/\b(north|south|east|west|n|s|e|w|ne|nw|se|sw)\b/gi, ' ');
  
  // Remove ALL remaining non-alphanumeric characters and collapse spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  normalized = normalized.replace(/\s+/g, ''); // Remove all spaces for final comparison
  
  return normalized.trim();
}

// Test Pepsi variations
const pepsiVariations = [
  'PEPSI',
  'Pepsi',
  'PEPSI COLA',
  'PEPSI-COLA',
  'PEPSI COLA (211)',
  'pepsi cola',
  'Pepsi Cola Company',
  'PEPSI COLA INC',
  'PEPSI BEVERAGES',
  'Pepsi Products'
];

console.log('Testing Pepsi variations:');
console.log('========================');

const normalizedResults = new Map();

for (const variation of pepsiVariations) {
  const normalized = superNormalizeForDuplicates(variation);
  console.log(`"${variation}" => "${normalized}"`);
  
  if (!normalizedResults.has(normalized)) {
    normalizedResults.set(normalized, []);
  }
  normalizedResults.get(normalized).push(variation);
}

console.log('\nDuplicate groups found:');
console.log('======================');
for (const [normalized, originals] of normalizedResults) {
  if (originals.length > 1) {
    console.log(`Group "${normalized}": ${originals.join(', ')}`);
  }
}

// Test other common duplicates
console.log('\n\nTesting other common variations:');
console.log('================================');

const otherTests = [
  ['McDonald\'s', 'MCDONALDS', 'McDonalds Restaurant', 'McDonald\'s Corporation'],
  ['Wal-Mart', 'WALMART', 'Walmart Stores', 'Wal-Mart Stores Inc'],
  ['AT&T', 'AT & T', 'ATT', 'AT&T Wireless', 'AT&T Communications'],
  ['7-Eleven', '7 ELEVEN', 'Seven Eleven', '7-Eleven Store #123'],
  ['Coca Cola', 'COCA-COLA', 'Coca-Cola Company', 'COCA COLA BEVERAGES', 'Coca Cola (123)'],
  ['Wells Fargo', 'WELLS FARGO BANK', 'Wells Fargo Financial', 'WELLS-FARGO', 'Wells Fargo & Company'],
  ['Home Depot', 'THE HOME DEPOT', 'Home Depot Inc', 'HOME DEPOT STORE', 'Home Depot (456)'],
  ['CVS', 'CVS PHARMACY', 'CVS Health', 'CVS/pharmacy', 'CVS Caremark Corporation'],
  ['Chase', 'CHASE BANK', 'JPMorgan Chase', 'Chase Banking', 'CHASE (789)'],
  ['Amazon', 'AMAZON.COM', 'Amazon Web Services', 'Amazon Inc', 'AMAZON PRIME'],
  ['Google', 'GOOGLE LLC', 'Google Cloud', 'GOOGLE INC', 'Google Corporation'],
  ['Starbucks', 'STARBUCKS COFFEE', 'Starbucks Corporation', 'STARBUCKS STORE #123', 'Starbucks Coffee Company'],
];

for (const group of otherTests) {
  console.log(`\nTesting: ${group[0]} variations`);
  const groupNormalized = new Map();
  
  for (const variation of group) {
    const normalized = superNormalizeForDuplicates(variation);
    console.log(`  "${variation}" => "${normalized}"`);
    
    if (!groupNormalized.has(normalized)) {
      groupNormalized.set(normalized, []);
    }
    groupNormalized.get(normalized).push(variation);
  }
  
  for (const [normalized, originals] of groupNormalized) {
    if (originals.length > 1) {
      console.log(`  ✓ Duplicates detected: ${originals.join(', ')}`);
    }
  }
}

// Test some edge cases
console.log('\n\nTesting edge cases:');
console.log('===================');

const edgeCases = [
  ['Bank of America', 'BANK OF AMERICA CORP', 'BofA', 'Bank of America Corporation', 'BANK OF AMERICA NA'],
  ['U.S. Bank', 'US BANK', 'U.S. BANK', 'US Bank National Association', 'U.S. BANK (123)'],
  ['T-Mobile', 'TMOBILE', 'T Mobile', 'T-Mobile USA', 'T-Mobile Communications'],
  ['Dr. Pepper', 'DR PEPPER', 'Dr Pepper', 'Doctor Pepper', 'DR. PEPPER SNAPPLE GROUP'],
];

for (const group of edgeCases) {
  console.log(`\nTesting: ${group[0]} variations`);
  const groupNormalized = new Map();
  
  for (const variation of group) {
    const normalized = superNormalizeForDuplicates(variation);
    console.log(`  "${variation}" => "${normalized}"`);
    
    if (!groupNormalized.has(normalized)) {
      groupNormalized.set(normalized, []);
    }
    groupNormalized.get(normalized).push(variation);
  }
  
  for (const [normalized, originals] of groupNormalized) {
    if (originals.length > 1) {
      console.log(`  ✓ Duplicates detected: ${originals.join(', ')}`);
    }
  }
}