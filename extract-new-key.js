#!/usr/bin/env node
import forge from 'node-forge';
import fs from 'fs';

const p12Path = './attached_assets/finexio2-production_1753991031109.p12';
// Try different passwords
const passwords = [
  '', // empty
  'password', // common default
  process.env.MASTERCARD_KEYSTORE_PASSWORD || '',
  'finexio', // company name
  'mastercard' // service name
];

let password = '';
let p12Success = false;

// Try each password
for (const testPassword of passwords) {
  try {
    const p12Der = fs.readFileSync(p12Path);
    const p12Asn1 = forge.asn1.fromDer(p12Der.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, testPassword);

    const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    
    if (!keyBag || !keyBag.key) {
      continue;
    }

    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
    
    // Save this as a different file to test
    fs.writeFileSync('./mastercard-2024-private-key.pem', privateKeyPem);
    console.log(`✅ Successfully extracted private key with password: "${testPassword || '(empty)'}"'`);
    console.log('✅ Saved to: mastercard-2024-private-key.pem');
    
    // Also show certificate info
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const cert = certBags[forge.pki.oids.certBag][0].cert;
    console.log('\nCertificate details:');
    console.log('- Subject:', cert.subject.getField('CN').value);
    console.log('- Valid from:', cert.validity.notBefore);
    console.log('- Valid to:', cert.validity.notAfter);
    
    p12Success = true;
    password = testPassword;
    break;

  } catch (error) {
    // Try next password
    continue;
  }
}

if (!p12Success) {
  console.error('❌ Could not extract key with any of the common passwords');
  console.error('The 2024 certificate file requires a different password');
}