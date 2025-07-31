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
  
  // Schema for payee records in BigQuery
  private payeeRecordSchema = z.object({
    payee_id: z.string(),
    payee_name: z.string(),
    normalized_name: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    category: z.string().optional(),
    sic_code: z.string().optional(),
    is_active: z.boolean().default(true),
  });
  
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
    
    const dataset = process.env.BIGQUERY_DATASET || 'payee_data';
    const table = process.env.BIGQUERY_TABLE || 'known_payees';
    
    // Query with fuzzy matching using BigQuery's string functions
    const query = `
      SELECT 
        payee_id,
        payee_name,
        normalized_name,
        aliases,
        category,
        sic_code,
        -- Calculate similarity scores
        GREATEST(
          -- Exact match
          IF(LOWER(payee_name) = LOWER(@payeeName), 1.0, 0),
          -- Normalized name match
          IF(LOWER(normalized_name) = LOWER(@payeeName), 0.95, 0),
          -- Contains match
          IF(LOWER(payee_name) LIKE CONCAT('%', LOWER(@payeeName), '%'), 0.8, 0),
          -- Levenshtein distance approximation
          (1 - (ABS(LENGTH(payee_name) - LENGTH(@payeeName)) / GREATEST(LENGTH(payee_name), LENGTH(@payeeName)))) * 0.7
        ) as similarity_score
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
      WHERE is_active = TRUE
        AND (
          LOWER(payee_name) LIKE CONCAT('%', LOWER(@payeeName), '%')
          OR LOWER(normalized_name) LIKE CONCAT('%', LOWER(@payeeName), '%')
          OR EXISTS (
            SELECT 1 FROM UNNEST(aliases) AS alias 
            WHERE LOWER(alias) LIKE CONCAT('%', LOWER(@payeeName), '%')
          )
        )
      ORDER BY similarity_score DESC
      LIMIT 10
    `;
    
    const options = {
      query: query,
      params: { payeeName },
    };
    
    try {
      const [rows] = await this.bigquery.query(options);
      
      return rows.map(row => ({
        payeeId: row.payee_id,
        payeeName: row.payee_name,
        normalizedName: row.normalized_name,
        aliases: row.aliases,
        category: row.category,
        sicCode: row.sic_code,
      }));
    } catch (error) {
      console.error('Error querying BigQuery:', error);
      throw error;
    }
  }
  
  // Insert or update payee records in BigQuery
  async upsertPayee(payee: {
    payeeId: string;
    payeeName: string;
    normalizedName?: string;
    aliases?: string[];
    category?: string;
    sicCode?: string;
  }): Promise<void> {
    if (!this.isConfigured || !this.bigquery) {
      throw new Error('BigQuery service not configured');
    }
    
    const dataset = process.env.BIGQUERY_DATASET || 'payee_data';
    const table = process.env.BIGQUERY_TABLE || 'known_payees';
    
    const row = {
      payee_id: payee.payeeId,
      payee_name: payee.payeeName,
      normalized_name: payee.normalizedName || payee.payeeName.toLowerCase().trim(),
      aliases: payee.aliases || [],
      category: payee.category,
      sic_code: payee.sicCode,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    
    try {
      await this.bigquery
        .dataset(dataset)
        .table(table)
        .insert([row], { 
          skipInvalidRows: false,
          ignoreUnknownValues: false,
          createInsertId: false,
        });
    } catch (error: any) {
      // Handle duplicate key error by updating instead
      if (error.code === 409 || error.message?.includes('duplicate')) {
        await this.updatePayee(payee);
      } else {
        throw error;
      }
    }
  }
  
  private async updatePayee(payee: {
    payeeId: string;
    payeeName: string;
    normalizedName?: string;
    aliases?: string[];
    category?: string;
    sicCode?: string;
  }): Promise<void> {
    const dataset = process.env.BIGQUERY_DATASET || 'payee_data';
    const table = process.env.BIGQUERY_TABLE || 'known_payees';
    
    const query = `
      UPDATE \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.${table}\`
      SET 
        payee_name = @payeeName,
        normalized_name = @normalizedName,
        aliases = @aliases,
        category = @category,
        sic_code = @sicCode,
        updated_at = CURRENT_TIMESTAMP()
      WHERE payee_id = @payeeId
    `;
    
    const options = {
      query: query,
      params: {
        payeeId: payee.payeeId,
        payeeName: payee.payeeName,
        normalizedName: payee.normalizedName || payee.payeeName.toLowerCase().trim(),
        aliases: payee.aliases || [],
        category: payee.category,
        sicCode: payee.sicCode,
      },
    };
    
    await this.bigquery!.query(options);
  }
}

export const bigQueryService = new BigQueryService();