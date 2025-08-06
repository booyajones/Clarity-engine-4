#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function showStarbucksResult() {
  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  const searchId = '6d7c3777-6775-43e5-9fa4-977ffcb548a3';
  
  const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
  const resultsAuthHeader = oauth.getAuthorizationHeader(
    resultsUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );

  const resultsResponse = await fetch(resultsUrl, {
    method: 'GET',
    headers: {
      'Authorization': resultsAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });

  if (resultsResponse.ok) {
    const data = await resultsResponse.json();
    console.log('STARBUCKS SEARCH RESULTS:\n');
    
    if (data.data?.items && data.data.items.length > 0) {
      data.data.items.forEach(item => {
        const details = item.searchResult?.entityDetails;
        const cardData = item.searchResult?.cardProcessingHistory;
        
        console.log('Match Details:');
        console.log('- Business Name:', details?.businessName);
        console.log('- Tax ID:', details?.organisationIdentifications?.[0]?.identification);
        console.log('- MCC Code:', cardData?.mcc);
        console.log('- MCC Group:', cardData?.mccGroup);
        console.log('- Confidence:', item.confidence);
        console.log('- Address:', details?.businessAddress?.addressLine1 + ', ' + 
                   details?.businessAddress?.townName + ', ' + 
                   details?.businessAddress?.countrySubDivision + ' ' + 
                   details?.businessAddress?.postCode);
        console.log('- Phone:', details?.phoneNumber);
      });
    }
  }
}

showStarbucksResult().catch(console.error);
