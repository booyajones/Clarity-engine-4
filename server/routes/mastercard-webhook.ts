import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Store webhook secret for signature verification
const WEBHOOK_SECRET = process.env.MASTERCARD_WEBHOOK_SECRET || '';

/**
 * Verify webhook signature from Mastercard
 */
function verifyWebhookSignature(req: Request): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('⚠️ Mastercard webhook secret not configured');
    return true; // Allow in development, but log warning
  }

  const signature = req.headers['x-mastercard-signature'];
  if (!signature) {
    console.error('❌ Webhook signature missing');
    return false;
  }

  // Calculate expected signature
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Handle Mastercard webhook notifications
 */
router.post('/webhooks/mastercard/search-notifications', async (req: Request, res: Response) => {
  try {
    console.info('📡 Received Mastercard webhook notification');

    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { eventId, eventType, eventCreatedDate, data } = req.body;

    console.info(`📡 Webhook event: ${eventType}`, {
      eventId,
      bulkRequestId: data?.bulkRequestId,
      eventCreatedDate
    });

    // Store webhook event for tracking
    await db.execute(sql`
      INSERT INTO webhook_events (
        event_id,
        event_type,
        bulk_request_id,
        payload,
        created_at
      ) VALUES (
        ${eventId},
        ${eventType},
        ${data?.bulkRequestId},
        ${JSON.stringify(req.body)},
        NOW()
      )
      ON CONFLICT (event_id) DO NOTHING
    `);

    // Handle different event types
    switch (eventType) {
      case 'BULK_SEARCH_RESULTS_READY':
        await handleSearchResultsReady(data);
        break;

      case 'BULK_SEARCH_CANCELLED':
        await handleSearchCancelled(data);
        break;

      default:
        console.warn(`⚠️ Unknown webhook event type: ${eventType}`);
    }

    // Acknowledge receipt immediately (must respond within 5 seconds)
    res.status(204).send();

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    
    // Still acknowledge receipt to prevent retries
    res.status(204).send();
    
    // Process error asynchronously
    setImmediate(() => {
      console.error('Processing webhook error details:', error);
    });
  }
});

/**
 * Handle search results ready notification
 */
async function handleSearchResultsReady(data: any) {
  const { bulkRequestId } = data;
  
  console.info(`✅ Search results ready for: ${bulkRequestId}`);
  
  try {
    // Update search status
    await db.execute(sql`
      UPDATE mastercard_search_requests
      SET 
        status = 'webhook_received',
        webhook_received_at = NOW(),
        webhook_status = 'results_ready'
      WHERE search_id = ${bulkRequestId}
    `);

    // Import and trigger results processing
    const { mastercardAsyncService } = await import('../services/mastercardAsyncService');
    
    // Process results asynchronously
    setImmediate(async () => {
      try {
        console.info(`🔄 Processing search results for: ${bulkRequestId}`);
        // Fetch the actual results from Mastercard
        const results = await mastercardAsyncService.fetchSearchResults(bulkRequestId);
        if (results) {
          await mastercardAsyncService.processSearchResults(bulkRequestId, results);
          console.info(`✅ Successfully processed results for: ${bulkRequestId}`);
        }
      } catch (error) {
        console.error(`❌ Error processing results for ${bulkRequestId}:`, error);
      }
    });

  } catch (error) {
    console.error(`❌ Error handling results ready for ${bulkRequestId}:`, error);
  }
}

/**
 * Handle search cancelled notification
 */
async function handleSearchCancelled(data: any) {
  const { bulkRequestId, errors } = data;
  
  console.error(`❌ Search cancelled for: ${bulkRequestId}`, errors);
  
  try {
    // Update search status
    await db.execute(sql`
      UPDATE mastercard_search_requests
      SET 
        status = 'cancelled',
        webhook_received_at = NOW(),
        webhook_status = 'cancelled',
        error_message = ${JSON.stringify(errors)}
      WHERE search_id = ${bulkRequestId}
    `);

    // Mark all related classifications as failed
    await db.execute(sql`
      UPDATE payee_classifications
      SET 
        mastercard_match_status = 'error',
        mastercard_error_message = 'Search cancelled by Mastercard'
      WHERE mastercard_search_id = ${bulkRequestId}
    `);

  } catch (error) {
    console.error(`❌ Error handling search cancelled for ${bulkRequestId}:`, error);
  }
}

/**
 * Health check endpoint for webhook
 */
router.get('/webhooks/mastercard/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    webhookEnabled: true,
    secretConfigured: !!WEBHOOK_SECRET
  });
});

export default router;