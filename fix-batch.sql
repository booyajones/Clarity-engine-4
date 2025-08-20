UPDATE upload_batches 
SET 
  finexio_enabled = false,
  mastercard_enabled = true,
  akkio_enabled = false,
  google_address_enabled = false,
  finexio_complete = true,
  google_address_complete = true,
  akkio_complete = true,
  mastercard_complete = false
WHERE id = 112;

SELECT 'Batch 112 configured for Mastercard' as result;
