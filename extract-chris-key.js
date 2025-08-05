#!/usr/bin/env node
import forge from 'node-forge';
import fs from 'fs';

const p12Path = './chris-finexio-new.p12';

// Try different passwords
const passwords = [
  'Finexi0$', // User provided password
  process.env.MASTERCARD_KEYSTORE_PASSWORD || '',
  '', // empty password
  'changeit', // common default
  'password', // common default
  'chris_finexio' // keystore alias
];

console.log('Extracting private key from Chris Finexio certificate...');

let success = false;
for (const password of passwords) {
  try {
    console.log(`Trying with password: "${password || '(empty)'}"...`);
    
    const p12Der = fs.readFileSync(p12Path);
    const p12Asn1 = forge.asn1.fromDer(p12Der.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    
    if (!keyBag || !keyBag.key) {
      continue;
    }

    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
    
    // Save this as the new private key
    fs.writeFileSync('./mastercard-chris-private-key.pem', privateKeyPem);
    console.log(`\n✅ Successfully extracted private key with password: "${password || '(empty)'}"'`);
    console.log('✅ Saved to: mastercard-chris-private-key.pem');
    
    // Also show certificate info
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const cert = certBags[forge.pki.oids.certBag][0].cert;
    console.log('\nCertificate details:');
    console.log('- Subject:', cert.subject.getField('CN').value);
    console.log('- Valid from:', cert.validity.notBefore);
    console.log('- Valid to:', cert.validity.notAfter);
    
    success = true;
    break;

  } catch (error) {
    // Try next password
    continue;
  }
}

if (!success) {
  console.error('\n❌ Could not extract key with any common password.');
  console.error('Please provide the password for the chris_finexio certificate.');
}