INSERT INTO mastercard_search_requests (
  search_id,
  batch_id,
  status,
  search_payload,
  classification_ids,
  created_at
) VALUES (
  'manual-test-' || gen_random_uuid(),
  112,
  'submitted',
  '{"test": "manual"}',
  ARRAY['test-id-1', 'test-id-2', 'test-id-3'],
  NOW()
) RETURNING search_id;
