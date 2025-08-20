-- Add webhook tracking to mastercard_search_requests table
ALTER TABLE mastercard_search_requests 
ADD COLUMN IF NOT EXISTS webhook_status TEXT,
ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;

-- Create webhook events table for audit trail
CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  bulk_request_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_bulk_request_id 
ON webhook_events(bulk_request_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type 
ON webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_mastercard_search_requests_webhook_status 
ON mastercard_search_requests(webhook_status);

-- Add comment for documentation
COMMENT ON TABLE webhook_events IS 'Stores all Mastercard webhook notifications for audit and processing';
COMMENT ON COLUMN webhook_events.event_id IS 'Unique identifier from Mastercard for this event';
COMMENT ON COLUMN webhook_events.event_type IS 'Type of webhook event (BULK_SEARCH_RESULTS_READY, BULK_SEARCH_CANCELLED)';
COMMENT ON COLUMN webhook_events.bulk_request_id IS 'The search ID that this webhook relates to';
COMMENT ON COLUMN webhook_events.payload IS 'Complete webhook payload from Mastercard';
COMMENT ON COLUMN webhook_events.processed IS 'Whether this webhook has been successfully processed';
COMMENT ON COLUMN webhook_events.error_message IS 'Any error that occurred during processing';