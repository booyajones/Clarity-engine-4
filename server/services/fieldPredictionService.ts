import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface FieldPrediction {
  fieldName: string;
  predictedType: string;
  confidence: number;
  reasoning: string;
  dataPattern: string;
  suggestedMapping?: string;
}

export interface PredictionResult {
  predictions: FieldPrediction[];
  overallConfidence: number;
  recommendedActions: string[];
}

export class FieldPredictionService {
  
  // Field type patterns and detectors
  private static FIELD_PATTERNS = {
    // Financial fields
    amount: {
      patterns: [/amount/i, /total/i, /sum/i, /cost/i, /price/i, /value/i, /fee/i, /charge/i, /payment/i],
      dataPatterns: [/^\$?[\d,]+\.?\d*$/, /^[\d,]+\.?\d*$/, /^-?\$?[\d,]+\.?\d*$/],
      examples: ['$1,234.56', '1234.56', '1,234', '$-500.00']
    },
    date: {
      patterns: [/date/i, /time/i, /created/i, /updated/i, /modified/i, /expir/i, /due/i],
      dataPatterns: [
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // MM/DD/YYYY
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{1,2}-\d{1,2}-\d{2,4}$/, // MM-DD-YYYY
        /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i // Month names
      ],
      examples: ['12/31/2023', '2023-12-31', 'Jan 15, 2023']
    },
    email: {
      patterns: [/email/i, /mail/i, /contact/i],
      dataPatterns: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/],
      examples: ['user@example.com', 'contact@business.org']
    },
    phone: {
      patterns: [/phone/i, /tel/i, /mobile/i, /cell/i],
      dataPatterns: [
        /^\(\d{3}\)\s?\d{3}-\d{4}$/, // (123) 456-7890
        /^\d{3}-\d{3}-\d{4}$/, // 123-456-7890
        /^\d{10}$/, // 1234567890
        /^\+?1?[\s-]?\(\d{3}\)[\s-]?\d{3}[\s-]?\d{4}$/
      ],
      examples: ['(555) 123-4567', '555-123-4567', '5551234567']
    },
    taxId: {
      patterns: [/tax/i, /ein/i, /ssn/i, /tin/i, /federal/i],
      dataPatterns: [
        /^\d{2}-\d{7}$/, // EIN: 12-3456789
        /^\d{3}-\d{2}-\d{4}$/, // SSN: 123-45-6789
        /^\d{9}$/ // Plain 9 digits
      ],
      examples: ['12-3456789', '123-45-6789', '123456789']
    },
    name: {
      patterns: [/name/i, /title/i, /company/i, /business/i, /vendor/i, /payee/i, /customer/i],
      dataPatterns: [
        /^[A-Z][a-z]+\s+[A-Z][a-z]+/, // First Last
        /^[A-Z\s&,.-]+$/, // Business names
        /\b(LLC|INC|CORP|CO|LTD|LP|LLP)\b/i // Legal entities
      ],
      examples: ['John Smith', 'ABC Corporation LLC', 'Smith & Associates']
    },
    address: {
      patterns: [/address/i, /addr/i, /street/i, /location/i, /mailing/i, /physical/i],
      dataPatterns: [
        /^\d+\s+[A-Za-z\s]+/, // Street number + name
        /\b(St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pl)\b/i, // Street types
        /\bPO\s?Box\s?\d+/i // PO Box
      ],
      examples: ['123 Main St', '456 Oak Avenue', 'PO Box 789']
    },
    city: {
      patterns: [/city/i, /town/i, /municipality/i, /locality/i],
      dataPatterns: [
        /^[A-Za-z\s-']+$/, // City names
        /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/ // Proper case cities
      ],
      examples: ['New York', 'San Francisco', 'Chicago']
    },
    state: {
      patterns: [/state/i, /province/i, /region/i],
      dataPatterns: [
        /^[A-Z]{2}$/, // State codes
        /^(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)$/i
      ],
      examples: ['CA', 'NY', 'Texas', 'California']
    },
    zip: {
      patterns: [/zip/i, /postal/i, /postcode/i],
      dataPatterns: [
        /^\d{5}$/, // 5-digit zip
        /^\d{5}-\d{4}$/, // ZIP+4
        /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/ // Canadian postal
      ],
      examples: ['12345', '12345-6789', 'K1A 0A6']
    },
    category: {
      patterns: [/category/i, /type/i, /class/i, /group/i, /department/i, /division/i],
      dataPatterns: [
        /^[A-Za-z\s&-]+$/, // Category names
        /^\d{1,4}$/ // Category codes
      ],
      examples: ['Office Supplies', 'Technology', 'Professional Services']
    },
    id: {
      patterns: [/id/i, /number/i, /code/i, /ref/i, /reference/i],
      dataPatterns: [
        /^\d+$/, // Numeric IDs
        /^[A-Z0-9-]+$/, // Alphanumeric IDs
        /^[A-Z]{2,3}\d+$/ // Prefix + number
      ],
      examples: ['12345', 'INV-2023-001', 'REF12345']
    }
  };

  static async predictFields(headers: string[], sampleData: any[][]): Promise<PredictionResult> {
    const predictions: FieldPrediction[] = [];
    let totalConfidence = 0;

    console.log('🔍 Starting field prediction analysis...');
    console.log(`Headers: ${headers.join(', ')}`);
    console.log(`Sample data rows: ${sampleData.length}`);

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const columnData = sampleData.map(row => row[i]).filter(val => val != null && val !== '');
      
      console.log(`\n📊 Analyzing column "${header}" with ${columnData.length} data points`);
      
      const prediction = await this.predictFieldType(header, columnData);
      predictions.push(prediction);
      totalConfidence += prediction.confidence;
      
      console.log(`✓ Predicted: ${prediction.predictedType} (${prediction.confidence}% confidence)`);
    }

    const overallConfidence = Math.round(totalConfidence / headers.length);
    const recommendedActions = this.generateRecommendations(predictions);

    console.log(`\n🎯 Field prediction complete. Overall confidence: ${overallConfidence}%`);

    return {
      predictions,
      overallConfidence,
      recommendedActions
    };
  }

  private static async predictFieldType(header: string, columnData: string[]): Promise<FieldPrediction> {
    // First, try pattern matching
    const patternResult = this.analyzePatterns(header, columnData);
    
    if (patternResult.confidence >= 85) {
      console.log(`🎯 High confidence pattern match: ${patternResult.type}`);
      return patternResult;
    }

    // For ambiguous cases, use AI analysis
    console.log(`🤖 Using AI analysis for ambiguous field: ${header}`);
    const aiResult = await this.analyzeWithAI(header, columnData);
    
    // Combine pattern and AI analysis
    const combinedConfidence = Math.round((patternResult.confidence * 0.4) + (aiResult.confidence * 0.6));
    
    return {
      fieldName: header,
      predictedType: aiResult.confidence > patternResult.confidence ? aiResult.type : patternResult.type,
      confidence: combinedConfidence,
      reasoning: `Pattern analysis: ${patternResult.reasoning}. AI analysis: ${aiResult.reasoning}`,
      dataPattern: this.identifyDataPattern(columnData),
      suggestedMapping: this.getSuggestedMapping(aiResult.type || patternResult.type)
    };
  }

  private static analyzePatterns(header: string, columnData: string[]): { type: string, confidence: number, reasoning: string } {
    let bestMatch = { type: 'unknown', confidence: 0, reasoning: 'No clear pattern detected' };
    
    // Test each field type
    for (const [fieldType, config] of Object.entries(this.FIELD_PATTERNS)) {
      let headerScore = 0;
      let dataScore = 0;
      
      // Check header patterns
      for (const pattern of config.patterns) {
        if (pattern.test(header)) {
          headerScore = 70;
          break;
        }
      }
      
      // Check data patterns
      if (columnData.length > 0) {
        const matchingData = columnData.filter(data => 
          config.dataPatterns.some(pattern => pattern.test(data.toString().trim()))
        );
        
        dataScore = Math.round((matchingData.length / columnData.length) * 100);
      }
      
      // Combined score
      const totalScore = Math.round((headerScore * 0.4) + (dataScore * 0.6));
      
      if (totalScore > bestMatch.confidence) {
        bestMatch = {
          type: fieldType,
          confidence: totalScore,
          reasoning: `Header match: ${headerScore > 0 ? 'Yes' : 'No'}, Data pattern match: ${dataScore}%`
        };
      }
    }
    
    return bestMatch;
  }

  private static async analyzeWithAI(header: string, columnData: string[]): Promise<{ type: string, confidence: number, reasoning: string }> {
    try {
      const sampleData = columnData.slice(0, 5).join(', ');
      
      const prompt = `Analyze this data field and predict its type:

Field Name: "${header}"
Sample Data: ${sampleData}

Possible field types:
- amount (monetary values)
- date (dates/timestamps)  
- email (email addresses)
- phone (phone numbers)
- taxId (tax IDs, EINs, SSNs)
- name (person/business names)
- address (street addresses)
- city (city names)
- state (states/provinces)
- zip (postal codes)
- category (categories/types)
- id (identifiers/codes)
- text (general text)
- number (numeric values)

Respond with JSON only:
{
  "type": "predicted_type",
  "confidence": confidence_0_to_100,
  "reasoning": "brief explanation"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 200
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        type: result.type || 'unknown',
        confidence: Math.min(100, Math.max(0, result.confidence || 0)),
        reasoning: result.reasoning || 'AI analysis completed'
      };
      
    } catch (error) {
      console.error('AI field analysis error:', error);
      return { type: 'unknown', confidence: 30, reasoning: 'AI analysis failed' };
    }
  }

  private static identifyDataPattern(columnData: string[]): string {
    if (columnData.length === 0) return 'No data';
    
    const sample = columnData.slice(0, 3);
    const patterns: string[] = [];
    
    sample.forEach(data => {
      const str = data.toString().trim();
      if (str.match(/^\$?[\d,]+\.?\d*$/)) patterns.push('Currency');
      else if (str.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) patterns.push('Date (MM/DD/YYYY)');
      else if (str.match(/^\d{4}-\d{2}-\d{2}$/)) patterns.push('Date (YYYY-MM-DD)');
      else if (str.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) patterns.push('Email');
      else if (str.match(/^\d{3}-\d{3}-\d{4}$/)) patterns.push('Phone');
      else if (str.match(/^\d{5}(-\d{4})?$/)) patterns.push('ZIP Code');
      else if (str.match(/^[A-Z]{2}$/)) patterns.push('State Code');
      else if (str.match(/^\d+$/)) patterns.push('Number');
      else patterns.push('Text');
    });
    
    const mostCommon = patterns.reduce((a, b, i, arr) => 
      arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
    );
    
    return mostCommon;
  }

  private static getSuggestedMapping(fieldType: string): string | undefined {
    const mappings: Record<string, string> = {
      'amount': 'financial_amount',
      'date': 'transaction_date', 
      'name': 'payee_name',
      'address': 'street_address',
      'city': 'city_name',
      'state': 'state_code',
      'zip': 'postal_code',
      'email': 'contact_email',
      'phone': 'phone_number',
      'taxId': 'tax_identifier',
      'id': 'reference_id',
      'category': 'expense_category'
    };
    
    return mappings[fieldType];
  }

  private static generateRecommendations(predictions: FieldPrediction[]): string[] {
    const recommendations: string[] = [];
    
    const highConfidencePredictions = predictions.filter(p => p.confidence >= 80);
    const lowConfidencePredictions = predictions.filter(p => p.confidence < 60);
    
    if (highConfidencePredictions.length > 0) {
      recommendations.push(`${highConfidencePredictions.length} fields detected with high confidence - ready for automatic mapping`);
    }
    
    if (lowConfidencePredictions.length > 0) {
      recommendations.push(`${lowConfidencePredictions.length} fields need manual review - consider renaming or providing examples`);
    }
    
    // Check for important missing fields
    const detectedTypes = predictions.map(p => p.predictedType);
    const importantFields = ['name', 'amount', 'date'];
    const missingFields = importantFields.filter(field => !detectedTypes.includes(field));
    
    if (missingFields.length > 0) {
      recommendations.push(`Consider mapping fields for: ${missingFields.join(', ')}`);
    }
    
    // Check for address completeness
    const addressFields = ['address', 'city', 'state', 'zip'];
    const hasAddressFields = addressFields.filter(field => detectedTypes.includes(field));
    
    if (hasAddressFields.length > 0 && hasAddressFields.length < 4) {
      recommendations.push('Partial address information detected - consider enabling Google Address Validation');
    }
    
    if (hasAddressFields.length >= 3) {
      recommendations.push('Complete address information detected - ideal for Google Address Validation and Mastercard enrichment');
    }
    
    return recommendations;
  }
}

export const fieldPredictionService = new FieldPredictionService();