UPDATE upload_batches 
SET 
  tools_config = jsonb_build_object(
    'enableFinexio', true,
    'enableMastercard', true,
    'enableGoogleAddressValidation', false,
    'enableAkkio', false
  ),
  finexio_matching_status = 'completed',
  google_address_status = 'skipped'
WHERE id = 112;

-- Also update classifications to mark them as needing Mastercard enrichment
UPDATE payee_classifications 
SET mastercard_match_status = NULL
WHERE batch_id = 112 AND payee_type = 'Business';

SELECT 'Batch 112 updated for Mastercard enrichment' as result;
