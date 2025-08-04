import OpenAI from 'openai';
import { addressValidationService } from './addressValidationService';

interface AddressContext {
  payeeName?: string;
  payeeType?: string;
  sicDescription?: string;
  originalAddress: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  googleValidationResult?: any;
}

interface IntelligentAddressResult {
  useOpenAI: boolean;
  reason: string;
  enhancedAddress?: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    confidence: number;
    corrections: string[];
  };
  strategy: 'google_only' | 'openai_enhancement' | 'openai_recovery' | 'hybrid';
}

export class IntelligentAddressService {
  private openai: OpenAI | null;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      this.openai = null;
      console.warn('⚠️ OpenAI API key not configured - intelligent address enhancement disabled');
    }
  }

  /**
   * Sophisticated decision engine for when to use OpenAI address enhancement
   */
  private shouldUseOpenAI(context: AddressContext): { use: boolean; reason: string; strategy: string } {
    const { originalAddress, googleValidationResult, payeeName, payeeType } = context;
    
    // Strategy 1: Google validation failed or low confidence
    if (!googleValidationResult || googleValidationResult.error) {
      return {
        use: true,
        reason: 'Google validation failed - using OpenAI for address recovery',
        strategy: 'openai_recovery'
      };
    }
    
    const googleData = googleValidationResult.data?.result;
    const verdict = googleData?.verdict;
    
    // Strategy 2: Incomplete or unconfirmed components
    if (verdict && (verdict.hasUnconfirmedComponents || !verdict.addressComplete)) {
      return {
        use: true,
        reason: 'Address has unconfirmed or incomplete components',
        strategy: 'openai_enhancement'
      };
    }
    
    // Strategy 3: Low granularity validation
    if (verdict && ['APPROXIMATE', 'GEOMETRIC_CENTER', 'RANGE_INTERPOLATED'].includes(verdict.geocodeGranularity)) {
      return {
        use: true,
        reason: 'Low precision geocoding - AI can improve accuracy',
        strategy: 'openai_enhancement'
      };
    }
    
    // Strategy 4: Missing critical components
    const hasStreetAddress = originalAddress.address && originalAddress.address.trim().length > 0;
    const hasCity = originalAddress.city && originalAddress.city.trim().length > 0;
    const hasState = originalAddress.state && originalAddress.state.trim().length > 0;
    
    if (!hasStreetAddress || !hasCity || !hasState) {
      return {
        use: true,
        reason: 'Missing critical address components that AI might infer from context',
        strategy: 'openai_enhancement'
      };
    }
    
    // Strategy 5: Known business with generic address
    if (payeeType === 'Business' && payeeName) {
      const genericAddressPatterns = [
        /^(po box|p\.o\. box)/i,
        /^(main st|main street|1st st|first street)$/i,
        /^(\d{1,3} main)/i,
        /^(one|two|three|four|five) [a-z]+ (plaza|center|square)$/i
      ];
      
      const addressStr = originalAddress.address?.toLowerCase() || '';
      if (genericAddressPatterns.some(pattern => pattern.test(addressStr))) {
        return {
          use: true,
          reason: 'Generic address for known business - AI can find specific location',
          strategy: 'openai_enhancement'
        };
      }
    }
    
    // Strategy 6: International or non-standard formats
    const usStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
    const stateUpper = originalAddress.state?.toUpperCase();
    if (stateUpper && !usStates.includes(stateUpper) && stateUpper.length > 2) {
      return {
        use: true,
        reason: 'Non-US or non-standard state format detected',
        strategy: 'openai_enhancement'
      };
    }
    
    // Strategy 7: Suspicious character patterns or typos
    const suspiciousPatterns = [
      /[0-9]{2,}[a-z]{2,}/i,  // Numbers followed by letters without space
      /[a-z]{3,}[0-9]{2,}/i,  // Letters followed by numbers without space
      /(.)\1{3,}/,            // Same character repeated 4+ times
      /[^a-zA-Z0-9\s,.\-#]/  // Unusual characters for addresses
    ];
    
    const fullAddress = `${originalAddress.address} ${originalAddress.city} ${originalAddress.state}`;
    if (suspiciousPatterns.some(pattern => pattern.test(fullAddress))) {
      return {
        use: true,
        reason: 'Detected potential typos or formatting issues',
        strategy: 'openai_enhancement'
      };
    }
    
    // Strategy 8: Confidence-based decision
    const confidence = googleValidationResult.data?.confidence || 0;
    if (confidence < 0.8) {
      return {
        use: true,
        reason: `Google validation confidence (${(confidence * 100).toFixed(0)}%) below threshold`,
        strategy: 'hybrid'
      };
    }
    
    // Default: Don't use OpenAI if Google validation is high quality
    return {
      use: false,
      reason: 'Google validation is sufficient - high confidence and complete',
      strategy: 'google_only'
    };
  }

  /**
   * Use OpenAI to intelligently enhance or correct address data
   */
  private async enhanceAddressWithOpenAI(context: AddressContext): Promise<any> {
    if (!this.openai) {
      console.warn('OpenAI not configured - cannot enhance address');
      return {
        correctedAddress: {
          streetAddress: context.originalAddress.address || '',
          city: context.originalAddress.city || '',
          state: context.originalAddress.state || '',
          zipCode: context.originalAddress.zipCode || ''
        },
        confidence: 0.5,
        corrections: ['OpenAI not configured'],
        reasoning: 'OpenAI API key not configured - returning original address'
      };
    }
    const prompt = `You are an expert at address validation and correction. Analyze the following information and provide the most accurate, complete address possible.

Context:
- Payee Name: ${context.payeeName || 'Unknown'}
- Payee Type: ${context.payeeType || 'Unknown'}
- Industry: ${context.sicDescription || 'Unknown'}

Original Address Components:
- Street: ${context.originalAddress.address || 'Missing'}
- City: ${context.originalAddress.city || 'Missing'}
- State: ${context.originalAddress.state || 'Missing'}
- ZIP: ${context.originalAddress.zipCode || 'Missing'}

${context.googleValidationResult ? `
Google Validation Result:
- Status: ${context.googleValidationResult.error ? 'Failed' : 'Success'}
- Confidence: ${context.googleValidationResult.data?.confidence || 'N/A'}
- Issues: ${context.googleValidationResult.data?.result?.verdict?.hasUnconfirmedComponents ? 'Has unconfirmed components' : 'None'}
- Suggested: ${context.googleValidationResult.data?.result?.address?.formattedAddress || 'None'}
` : 'Google validation not available'}

Task: Provide the corrected and complete address. Consider:
1. Fix any typos or misspellings
2. Complete missing components using context (e.g., well-known company locations)
3. Standardize formatting to USPS standards
4. If the payee is a well-known business, use their actual headquarters or primary address
5. Explain what corrections were made

Respond in JSON format:
{
  "correctedAddress": {
    "streetAddress": "string",
    "city": "string", 
    "state": "string (2-letter code)",
    "zipCode": "string"
  },
  "confidence": 0.0-1.0,
  "corrections": ["list of corrections made"],
  "reasoning": "explanation of corrections and confidence level"
}`;

    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI request timeout')), 10000)
      );
      
      const responsePromise = this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an address validation expert. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 500
      });
      
      const response = await Promise.race([responsePromise, timeoutPromise]) as any;
      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result;
    } catch (error: any) {
      console.error('OpenAI address enhancement error:', error.message);
      // Return a fallback response when OpenAI fails
      return {
        correctedAddress: {
          streetAddress: context.originalAddress.address || '',
          city: context.originalAddress.city || '',
          state: context.originalAddress.state || '',
          zipCode: context.originalAddress.zipCode || ''
        },
        confidence: 0.5,
        corrections: ['OpenAI enhancement failed - returning original address'],
        reasoning: `OpenAI error: ${error.message}`
      };
    }
  }

  /**
   * Main intelligent address processing method
   */
  async processAddressIntelligently(
    address: string,
    city: string | null,
    state: string | null,
    zipCode: string | null,
    context: {
      payeeName?: string;
      payeeType?: string;
      sicDescription?: string;
    },
    options: { enableGoogleValidation?: boolean; enableOpenAI?: boolean } = {}
  ): Promise<IntelligentAddressResult> {
    const originalAddress = { 
      address: address || undefined, 
      city: city || undefined, 
      state: state || undefined, 
      zipCode: zipCode || undefined 
    };
    
    // Step 1: Try Google validation first if enabled
    let googleResult = null;
    if (options.enableGoogleValidation !== false) {
      googleResult = await addressValidationService.validateAddress(
        address,
        city,
        state,
        zipCode,
        { 
          enableGoogleValidation: true,
          enableOpenAI: false  // CRITICAL: Prevent infinite recursion
        }
      );
    }
    
    // Step 2: Build context for decision
    const addressContext: AddressContext = {
      ...context,
      originalAddress,
      googleValidationResult: googleResult
    };
    
    // Step 3: Intelligent decision on whether to use OpenAI
    const decision = this.shouldUseOpenAI(addressContext);
    
    if (!decision.use || options.enableOpenAI === false) {
      return {
        useOpenAI: false,
        reason: decision.reason,
        strategy: 'google_only' as const
      };
    }
    
    // Step 4: Use OpenAI to enhance the address
    console.log(`Using OpenAI for address enhancement: ${decision.reason}`);
    const openAIResult = await this.enhanceAddressWithOpenAI(addressContext);
    
    if (!openAIResult || !openAIResult.correctedAddress) {
      return {
        useOpenAI: true,
        reason: 'OpenAI enhancement attempted but failed',
        strategy: decision.strategy as any
      };
    }
    
    // Step 5: Return enhanced address with metadata
    return {
      useOpenAI: true,
      reason: decision.reason,
      enhancedAddress: {
        address: openAIResult.correctedAddress.streetAddress,
        city: openAIResult.correctedAddress.city,
        state: openAIResult.correctedAddress.state,
        zipCode: openAIResult.correctedAddress.zipCode,
        confidence: openAIResult.confidence,
        corrections: openAIResult.corrections || []
      },
      strategy: decision.strategy as any
    };
  }

  /**
   * Validate if OpenAI enhancement actually improved the address
   */
  async validateEnhancement(
    originalGoogle: any,
    openAIEnhanced: any
  ): Promise<{ improved: boolean; reason: string }> {
    // If we didn't have Google results, any valid OpenAI result is an improvement
    if (!originalGoogle || originalGoogle.error) {
      return {
        improved: true,
        reason: 'OpenAI provided address when Google validation failed'
      };
    }
    
    // Compare confidence scores
    const googleConfidence = originalGoogle.data?.confidence || 0;
    const openAIConfidence = openAIEnhanced.confidence || 0;
    
    if (openAIConfidence > googleConfidence + 0.1) {
      return {
        improved: true,
        reason: `OpenAI confidence (${(openAIConfidence * 100).toFixed(0)}%) exceeds Google (${(googleConfidence * 100).toFixed(0)}%)`
      };
    }
    
    // Check if OpenAI added missing components
    const googleHasAll = originalGoogle.data?.result?.verdict?.addressComplete;
    const openAIComplete = openAIEnhanced.address && openAIEnhanced.city && openAIEnhanced.state && openAIEnhanced.zipCode;
    
    if (!googleHasAll && openAIComplete) {
      return {
        improved: true,
        reason: 'OpenAI completed missing address components'
      };
    }
    
    return {
      improved: false,
      reason: 'OpenAI enhancement did not significantly improve the address'
    };
  }
}

export const intelligentAddressService = new IntelligentAddressService();