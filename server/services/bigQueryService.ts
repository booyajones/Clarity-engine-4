import { BigQuery } from '@google-cloud/bigquery';
import { z } from 'zod';

// BigQuery configuration and service for payee matching
export class BigQueryService {
  private bigquery: BigQuery | null = null;
  private isConfigured = false;
  
  constructor() {
    this.initialize();
  }
  
  private initialize() {
    try {
      // Check if we have BigQuery credentials
      if (process.env.BIGQUERY_PROJECT_ID && process.env.BIGQUERY_CREDENTIALS) {
        const credentials = JSON.parse(process.env.BIGQUERY_CREDENTIALS);
        this.bigquery = new BigQuery({
          projectId: process.env.BIGQUERY_PROJECT_ID,
          credentials: credentials,
        });
        this.isConfigured = true;
        console.log('✅ BigQuery service initialized successfully');
      } else {
        console.log('🔔 BigQuery credentials not configured. Payee matching will be unavailable.');
      }
    } catch (error) {
      console.error('Error initializing BigQuery:', error);
      this.isConfigured = false;
    }
  }
  
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
  
  // Schema for payee records in BigQuery (matching your actual table structure)
  private payeeRecordSchema = z.object({
    id: z.string(),
    name: z.string(),
    category_c: z.string().optional(),
    mcc_c: z.string().optional(),
    primary_address_street_c: z.string().optional(),
    primary_address_city_c: z.string().optional(),
    primary_address_state_c: z.string().optional(),
    primary_address_postal_code_c: z.string().optional(),
    industry_c: z.string().optional(),
    mastercard_business_name_c: z.string().optional(),
    is_deleted: z.boolean().optional(),
  });
  
  // Get table schema
  async getTableSchema(datasetId: string, tableId: string): Promise<any> {
    if (!this.isConfigured || !this.bigquery) {
      throw new Error('BigQuery service not configured');
    }
    
    const dataset = this.bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    const [metadata] = await table.getMetadata();
    return metadata.schema;
  }

  // Query known payees from BigQuery
  async searchKnownPayees(payeeName: string): Promise<Array<{
    payeeId: string;
    payeeName: string;
    normalizedName?: string;
    aliases?: string[];
    category?: string;
    sicCode?: string;
  }>> {
    if (!this.isConfigured || !this.bigquery) {
      throw new Error('BigQuery service not configured');
    }
    
    const dataset = process.env.BIGQUERY_DATASET || 'SE_Enrichment';
    const table = process.env.BIGQUERY_TABLE || 'supplier';
    
    // Simple query to test connection and search
    const query = `
      SELECT 
        id,
        name,
        category_c,
        mcc_c,
        industry_c,
        mastercard_business_name_c,
        primary_address_city_c,
        primary_address_state_c
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
      WHERE COALESCE(is_deleted, false) = false
        AND (
          LOWER(name) LIKE CONCAT('%', LOWER(@payeeName), '%')
          OR LOWER(COALESCE(mastercard_business_name_c, '')) LIKE CONCAT('%', LOWER(@payeeName), '%')
        )
      ORDER BY name ASC
      LIMIT 10
    `;
    
    const options = {
      query: query,
      params: { payeeName },
    };
    
    try {
      const [rows] = await this.bigquery.query(options);
      
      return rows.map(row => ({
        payeeId: row.id,
        payeeName: row.name,
        normalizedName: row.mastercard_business_name_c || undefined,
        aliases: undefined, // Your table doesn't have aliases
        category: row.category_c || row.industry_c || undefined,
        sicCode: row.mcc_c || undefined,
      }));
    } catch (error) {
      console.error('Error querying BigQuery:', error);
      throw error;
    }
  }
  
  // Insert or update payee records in BigQuery (disabled for read-only access)
  async upsertPayee(payee: {
    payeeId: string;
    payeeName: string;
    normalizedName?: string;
    aliases?: string[];
    category?: string;
    sicCode?: string;
  }): Promise<void> {
    // This method is disabled since we only have read access to the existing supplier table
    console.log('upsertPayee disabled - read-only access to existing BigQuery table');
    return;
  }
  
  private async updatePayee(payee: {
    payeeId: string;
    payeeName: string;
    normalizedName?: string;
    aliases?: string[];
    category?: string;
    sicCode?: string;
  }): Promise<void> {
    // This method is disabled since we only have read access to the existing supplier table
    console.log('updatePayee disabled - read-only access to existing BigQuery table');
    return;
  }
}

export const bigQueryService = new BigQueryService();