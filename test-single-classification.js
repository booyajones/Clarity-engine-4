// Test a single classification
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testSingleClassification() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: `Classify payees as Business, Individual, or Government with 95%+ confidence.

Business: LLC/INC/CORP/CO/LTD suffixes, business keywords, brand names
Individual: Personal names without business indicators  
Government: City/County/State of, agencies, departments

Return concise JSON:
{"payeeType":"Business|Individual|Government","confidence":0.95-0.99,"sicCode":"XXXX","sicDescription":"Name","reasoning":"Brief reason","flagForReview":false}`
      }, {
        role: "user",
        content: `Classify this payee: "Microsoft Corporation"`
      }],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    console.log('Response:', response.choices[0].message.content);
    
    const parsed = JSON.parse(response.choices[0].message.content);
    console.log('Parsed:', parsed);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSingleClassification();