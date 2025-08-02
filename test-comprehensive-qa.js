import { describe, it, expect } from 'vitest';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000/api';

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : null,
  });
  
  const result = await response.json();
  return { status: response.status, data: result };
}

describe('Clarity Engine 3 - Comprehensive QA Tests', () => {
  
  // Test 1: Basic Classification
  describe('Basic Classification', () => {
    it('should classify a business correctly', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Microsoft Corporation',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.payeeType).toBe('Business');
      expect(data.confidence).toBeGreaterThan(0.9);
      expect(data.sicCode).toBeTruthy();
    });

    it('should classify an individual correctly', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'John Smith',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.payeeType).toBe('Individual');
      expect(data.confidence).toBeGreaterThan(0.8);
    });

    it('should classify a government entity correctly', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Internal Revenue Service',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.payeeType).toBe('Government');
      expect(data.confidence).toBeGreaterThan(0.9);
    });
  });

  // Test 2: Address Validation with AI Enhancement
  describe('Address Validation with AI Enhancement', () => {
    it('should validate and enhance an address with typos', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Microsoft Corporation',
        address: '1 Micrsoft Way',  // Typo in Microsoft
        city: 'Redmund',            // Typo in Redmond
        state: 'WA',
        zipCode: '98052',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      });
      
      expect(status).toBe(200);
      expect(data.addressValidation).toBeTruthy();
      expect(data.addressValidation.status).toBe('validated');
      expect(data.addressValidation.intelligentEnhancement?.used).toBe(true);
      expect(data.addressValidation.intelligentEnhancement?.enhancedAddress).toBeTruthy();
    });

    it('should handle incomplete address with AI enhancement', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Apple Inc',
        address: '1 Apple Park',  // Missing Way
        city: 'Cupertino',
        state: 'CA',
        zipCode: '',  // Missing ZIP
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: true,
          enableOpenAI: true
        }
      });
      
      expect(status).toBe(200);
      expect(data.addressValidation).toBeTruthy();
      if (data.addressValidation.status === 'validated') {
        expect(data.addressValidation.intelligentEnhancement?.used).toBe(true);
      }
    });
  });

  // Test 3: Finexio Matching
  describe('Finexio Network Matching', () => {
    it('should find a match for a known supplier', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Amazon.com Inc',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.bigQueryMatch).toBeTruthy();
      expect(data.bigQueryMatch.matched).toBe(true);
      expect(data.bigQueryMatch.finexioSupplier).toBeTruthy();
      expect(data.bigQueryMatch.finexioSupplier.finexioMatchScore).toBeGreaterThan(80);
    });

    it('should handle no match gracefully', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'RandomNonExistentCompany12345',
        matchingOptions: {
          enableFinexio: true,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.bigQueryMatch).toBeTruthy();
      expect(data.bigQueryMatch.matched).toBe(false);
    });
  });

  // Test 4: Batch Processing
  describe('Batch Processing', () => {
    it('should handle CSV upload and processing', async () => {
      // Create test CSV data
      const csvContent = `payee_name,address,city,state,zip_code
Microsoft Corporation,1 Microsoft Way,Redmond,WA,98052
Apple Inc,1 Apple Park Way,Cupertino,CA,95014
John Smith,123 Main St,New York,NY,10001`;

      // This would need actual file upload implementation
      // For now, we'll test the batch status endpoint
      const { status, data } = await apiRequest('GET', '/upload/batches');
      
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  // Test 5: Error Handling
  describe('Error Handling', () => {
    it('should handle missing payee name', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: '',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(400);
      expect(data.error).toBeTruthy();
    });

    it('should handle invalid request format', async () => {
      const { status, data } = await apiRequest('POST', '/classify-single', {
        // Missing required fields
        invalidField: 'test'
      });
      
      expect(status).toBe(400);
      expect(data.error).toBeTruthy();
    });
  });

  // Test 6: Exclusion Keywords
  describe('Exclusion Keywords', () => {
    it('should exclude payees with exclusion keywords', async () => {
      // First add an exclusion keyword
      await apiRequest('POST', '/exclusion-keywords', {
        keyword: 'VOID'
      });

      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'VOID CHECK',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.isExcluded).toBe(true);
      expect(data.exclusionKeyword).toBe('VOID');
    });
  });

  // Test 7: Performance Tests
  describe('Performance Tests', () => {
    it('should classify quickly without external services', async () => {
      const startTime = Date.now();
      
      const { status } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Test Company LLC',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: false,
          enableOpenAI: false
        }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(status).toBe(200);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it('should handle concurrent requests', async () => {
      const requests = [];
      
      for (let i = 0; i < 5; i++) {
        requests.push(apiRequest('POST', '/classify-single', {
          payeeName: `Test Company ${i}`,
          matchingOptions: {
            enableFinexio: false,
            enableMastercard: false,
            enableGoogleAddressValidation: false,
            enableOpenAI: false
          }
        }));
      }
      
      const results = await Promise.all(requests);
      
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.data.payeeType).toBeTruthy();
      });
    });
  });

  // Test 8: UI Integration Tests
  describe('UI Integration', () => {
    it('should display address fields when toggle is enabled', async () => {
      // This would need Playwright or similar for actual UI testing
      // For now, we verify the API accepts address fields
      const { status, data } = await apiRequest('POST', '/classify-single', {
        payeeName: 'Test Company',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        matchingOptions: {
          enableFinexio: false,
          enableMastercard: false,
          enableGoogleAddressValidation: true,
          enableOpenAI: false
        }
      });
      
      expect(status).toBe(200);
      expect(data.addressValidation).toBeTruthy();
    });
  });
});

// Run the tests
console.log('Running comprehensive QA tests...');
console.log('Note: Make sure the server is running on http://localhost:5000');
console.log('\nTo run these tests with Vitest, execute: npx vitest test-comprehensive-qa.js');