#!/usr/bin/env node
import forge from 'node-forge';
import fs from 'fs';

const p12Path = './mastercard-chris-finexio.p12';
const password = process.env.MASTERCARD_KEYSTORE_PASSWORD || '';

console.log('Extracting private key from Chris Finexio certificate...');

try {
  const p12Der = fs.readFileSync(p12Path);
  const p12Asn1 = forge.asn1.fromDer(p12Der.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
  
  if (!keyBag || !keyBag.key) {
    throw new Error('No private key found in P12 file');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  
  // Save this as the new private key
  fs.writeFileSync('./mastercard-chris-private-key.pem', privateKeyPem);
  console.log('✅ Successfully extracted private key from Chris Finexio P12 file');
  console.log('✅ Saved to: mastercard-chris-private-key.pem');
  
  // Also show certificate info
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = certBags[forge.pki.oids.certBag][0].cert;
  console.log('\nCertificate details:');
  console.log('- Subject:', cert.subject.getField('CN').value);
  console.log('- Valid from:', cert.validity.notBefore);
  console.log('- Valid to:', cert.validity.notAfter);

} catch (error) {
  console.error('Error extracting key:', error.message);
}