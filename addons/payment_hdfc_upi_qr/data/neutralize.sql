-- disable hdfc upi payment provider
UPDATE payment_provider
   SET hdfc_upi_merchant_id = NULL,
       hdfc_upi_merchant_name = NULL,
       hdfc_upi_merchant_category = NULL,
       hdfc_upi_encryption_key = NULL
