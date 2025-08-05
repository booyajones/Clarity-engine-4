#!/usr/bin/env node
import forge from 'node-forge';
import fs from 'fs';

// Extract private key from the new P12 file
const p12Path = './Finexio_MasterCard_Production_2025-production.p12';
const p12Password = '85NBfh!oa&Y?QzNP';
const keyAlias = 'Finexio_MasterCard_Production_2025';

try {
  const p12Data = fs.readFileSync(p12Path);
  const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(p12Data.toString('base64')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

  let privateKey = null;
  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && 
          safeBag.attributes.friendlyName && 
          safeBag.attributes.friendlyName[0] === keyAlias) {
        privateKey = safeBag.key;
        break;
      }
    }
    if (privateKey) break;
  }

  if (privateKey) {
    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
    fs.writeFileSync('./mastercard-private-key.pem', privateKeyPem);
    console.log('✅ Successfully extracted private key from new P12 file');
  } else {
    console.error('❌ Could not find private key with alias:', keyAlias);
  }
} catch (error) {
  console.error('❌ Error extracting key:', error.message);
}