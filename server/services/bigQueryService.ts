import { BigQuery } from '@google-cloud/bigquery';
import { z } from 'zod';

// Interface for BigQuery search results with enhanced Finexio matching
export interface BigQueryPayeeResult {
  payeeId: string;
  payeeName: string;
  normalizedName?: string;
  aliases?: string[];
  category?: string;
  sicCode?: string;
  industry?: string;
  paymentType?: string;
  confidence?: number;
  matchReasoning?: string;
  city?: string;
  state?: string;
}

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
  async searchKnownPayees(payeeName: string): Promise<BigQueryPayeeResult[]> {
    if (!this.isConfigured || !this.bigquery) {
      throw new Error('BigQuery service not configured');
    }
    
    const dataset = process.env.BIGQUERY_DATASET || 'SE_Enrichment';
    const table = process.env.BIGQUERY_TABLE || 'supplier';
    
    // Query with confidence scoring based on match quality
    const query = `
      WITH match_scores AS (
        SELECT 
          id,
          name,
          category_c,
          mcc_c,
          industry_c,
          payment_type_c,
          mastercard_business_name_c,
          primary_address_city_c,
          primary_address_state_c,
          -- Calculate confidence scores for different match types
          CASE
            -- Exact match (case-insensitive)
            WHEN LOWER(name) = LOWER(@payeeName) THEN 1.0
            WHEN LOWER(COALESCE(mastercard_business_name_c, '')) = LOWER(@payeeName) THEN 0.95
            -- Strong partial match (payee name contains the full supplier name)
            WHEN LOWER(@payeeName) LIKE CONCAT('%', LOWER(name), '%') THEN 0.85
            -- Standard partial match (supplier name contains payee name)
            WHEN LOWER(name) LIKE CONCAT('%', LOWER(@payeeName), '%') THEN 0.75
            WHEN LOWER(COALESCE(mastercard_business_name_c, '')) LIKE CONCAT('%', LOWER(@payeeName), '%') THEN 0.70
            -- Weak partial match
            ELSE 0.5
          END AS confidence_score,
          -- Match reasoning
          CASE
            WHEN LOWER(name) = LOWER(@payeeName) THEN 'Exact name match'
            WHEN LOWER(COALESCE(mastercard_business_name_c, '')) = LOWER(@payeeName) THEN 'Exact Mastercard name match'
            WHEN LOWER(@payeeName) LIKE CONCAT('%', LOWER(name), '%') THEN 'Payee name contains supplier name'
            WHEN LOWER(name) LIKE CONCAT('%', LOWER(@payeeName), '%') THEN 'Supplier name contains payee name'
            WHEN LOWER(COALESCE(mastercard_business_name_c, '')) LIKE CONCAT('%', LOWER(@payeeName), '%') THEN 'Mastercard name contains payee name'
            ELSE 'Partial text match'
          END AS match_reasoning
        FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
        WHERE COALESCE(is_deleted, false) = false
          AND (
            LOWER(name) LIKE CONCAT('%', LOWER(@payeeName), '%')
            OR LOWER(COALESCE(mastercard_business_name_c, '')) LIKE CONCAT('%', LOWER(@payeeName), '%')
            OR LOWER(@payeeName) LIKE CONCAT('%', LOWER(name), '%')
          )
      )
      SELECT * FROM match_scores
      ORDER BY confidence_score DESC, name ASC
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
        paymentType: row.payment_type_c || undefined,
        confidence: row.confidence_score || 0.5,
        matchReasoning: row.match_reasoning || 'Partial text match',
        city: row.primary_address_city_c || undefined,
        state: row.primary_address_state_c || undefined,
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
  
  // Get all suppliers from BigQuery with proper DISTINCT handling
  async getAllSuppliers(limit?: number): Promise<BigQueryPayeeResult[]> {
    if (!this.isConfigured || !this.bigquery) {
      throw new Error('BigQuery service not configured');
    }
    
    const dataset = process.env.BIGQUERY_DATASET || 'SE_Enrichment';
    const table = process.env.BIGQUERY_TABLE || 'supplier';
    
    // Query to get DISTINCT suppliers with proper handling of duplicates
    const query = `
      WITH distinct_suppliers AS (
        SELECT DISTINCT
          id,
          name,
          category_c,
          mcc_c,
          industry_c,
          payment_type_c,
          mastercard_business_name_c,
          primary_address_city_c,
          primary_address_state_c,
          ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY id) as rn
        FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
        WHERE COALESCE(is_deleted, false) = false
          AND name IS NOT NULL
          AND LENGTH(TRIM(name)) > 0
      )
      SELECT 
        id as payeeId,
        name as payeeName,
        category_c as category,
        mcc_c as sicCode,
        industry_c as industry,
        payment_type_c as paymentType,
        mastercard_business_name_c as normalizedName,
        primary_address_city_c as city,
        primary_address_state_c as state
      FROM distinct_suppliers
      WHERE rn = 1
      ORDER BY name ASC
      ${limit ? `LIMIT ${limit}` : ''}
    `;
    
    try {
      console.log(`Fetching ${limit ? `up to ${limit}` : 'ALL'} distinct suppliers from BigQuery...`);
      const [rows] = await this.bigquery.query({ query });
      
      console.log(`Retrieved ${rows.length} distinct suppliers from BigQuery`);
      
      return rows.map(row => ({
        payeeId: row.payeeId,
        payeeName: row.payeeName,
        normalizedName: row.normalizedName || undefined,
        aliases: undefined,
        category: row.category || row.industry || undefined,
        sicCode: row.sicCode || undefined,
        industry: row.industry || undefined,
        paymentType: row.paymentType || undefined,
        confidence: 1.0, // Base confidence for known suppliers
        city: row.city || undefined,
        state: row.state || undefined,
      }));
    } catch (error) {
      console.error('Error fetching all suppliers from BigQuery:', error);
      throw error;
    }
  }
}

export const bigQueryService = new BigQueryService();