-- disable phonepe payment provider
UPDATE payment_provider
   SET phonepe_client_id = NULL,
       phonepe_client_version = NULL,
       phonepe_client_secret = NULL,
       phonepe_webhook_username = NULL,
       phonepe_webhook_password = NULL,
       phonepe_access_token = NULL,
       phonepe_access_token_expiry = NULL;
