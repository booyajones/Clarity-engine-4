CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cached_suppliers_name ON cached_suppliers(payee_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cached_suppliers_search ON cached_suppliers(payee_name, city, state);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payee_classifications_status ON payee_classifications(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payee_classifications_batch ON payee_classifications(upload_batch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upload_batches_status ON upload_batches(status);
