import fs from 'fs';

// Find the routes file and add dashboard endpoint
const routesFile = './server/routes.ts';
const content = fs.readFileSync(routesFile, 'utf8');

// Check if dashboard endpoint already exists
if (!content.includes('/api/dashboard/stats')) {
  console.log('Dashboard API endpoint needed - will be added');
} else {
  console.log('Dashboard API endpoint already exists');
}
