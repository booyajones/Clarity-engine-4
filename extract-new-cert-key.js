#!/usr/bin/env node
import fs from 'fs';
import { execSync } from 'child_process';

const p12Path = './Finexio_MasterCard_Production_2025-production-new.p12';
const password = '85NBfh!oa&Y?QzNP';
const alias = 'Finexio_MasterCard_Production_2025';
const outputPath = './mastercard-new-private-key.pem';

console.log('Extracting private key from new P12 certificate...');
console.log('P12 file:', p12Path);
console.log('Using password:', password);
console.log('Alias:', alias);

try {
  // Extract private key from P12
  const command = `openssl pkcs12 -in "${p12Path}" -nocerts -nodes -out "${outputPath}" -passin pass:"${password}"`;
  
  execSync(command, { stdio: 'pipe' });
  
  console.log('✅ Private key extracted successfully to:', outputPath);
  
  // Read and display key info
  const keyContent = fs.readFileSync(outputPath, 'utf8');
  const hasPrivateKey = keyContent.includes('BEGIN PRIVATE KEY') || keyContent.includes('BEGIN RSA PRIVATE KEY');
  
  if (hasPrivateKey) {
    console.log('✅ Private key found in PEM file');
    
    // Get key details
    const keyInfo = execSync(`openssl rsa -in "${outputPath}" -noout -text | head -20`, { encoding: 'utf8' });
    console.log('\nKey details (first few lines):');
    console.log(keyInfo);
  }
  
} catch (error) {
  console.error('❌ Failed to extract private key:', error.message);
  console.error('Make sure the password is correct for this P12 file');
}