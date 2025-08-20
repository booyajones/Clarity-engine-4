#!/usr/bin/env node
import fs from 'fs';
import { execSync } from 'child_process';

const p12Path = './Finexio_MasterCard_Production_2025-production.p12';
const password = '85NBfh!oa&Y?QzNP';
const alias = 'Finexio_MasterCard_Production_2025';

console.log('Extracting certificate and private key from P12 file...');
console.log('P12 file:', p12Path);

try {
  // Extract certificate
  console.log('\n1. Extracting certificate...');
  const certCommand = `openssl pkcs12 -in "${p12Path}" -nokeys -clcerts -out temp-cert.pem -passin pass:"${password}"`;
  execSync(certCommand, { stdio: 'pipe' });
  const certContent = fs.readFileSync('temp-cert.pem', 'utf8');
  
  // Extract private key
  console.log('2. Extracting private key...');
  const keyCommand = `openssl pkcs12 -in "${p12Path}" -nocerts -nodes -out temp-key.pem -passin pass:"${password}"`;
  execSync(keyCommand, { stdio: 'pipe' });
  const keyContent = fs.readFileSync('temp-key.pem', 'utf8');
  
  // Clean up temp files
  fs.unlinkSync('temp-cert.pem');
  fs.unlinkSync('temp-key.pem');
  
  console.log('\n✅ Successfully extracted credentials!');
  console.log('\n📋 Add these to your Replit secrets:\n');
  
  console.log('MASTERCARD_KEY_ALIAS:');
  console.log(alias);
  console.log('\nMASTERCARD_CERT:');
  console.log(certContent);
  console.log('\nMASTERCARD_KEY:');
  console.log(keyContent);
  
  // Save to files for backup
  fs.writeFileSync('mastercard-cert.txt', certContent);
  fs.writeFileSync('mastercard-key.txt', keyContent);
  fs.writeFileSync('mastercard-alias.txt', alias);
  
  console.log('\n📁 Also saved to files:');
  console.log('- mastercard-cert.txt');
  console.log('- mastercard-key.txt');
  console.log('- mastercard-alias.txt');
  
} catch (error) {
  console.error('❌ Failed to extract credentials:', error.message);
}