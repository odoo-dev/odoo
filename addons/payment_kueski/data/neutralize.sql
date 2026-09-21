-- disable Kueski Pay payment provider
UPDATE payment_provider
   SET kueski_api_key = NULL,
       kueski_api_secret = NULL;
