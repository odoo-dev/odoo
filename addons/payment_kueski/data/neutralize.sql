-- disable Kueski Pay payment provider
UPDATE payment_provider
   SET kueski_merchant_id = NULL,
       kueski_key_id = NULL;
