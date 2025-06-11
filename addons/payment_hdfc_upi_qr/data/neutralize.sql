-- Part of Odoo. See LICENSE file for full copyright and licensing details.

-- Neutralize HDFC UPI provider credentials for security

UPDATE payment_provider
   SET hdfc_upi_merchant_id = NULL,
       hdfc_upi_merchant_name = NULL,
       hdfc_upi_encryption_key = NULL
 WHERE code = 'hdfc_upi';

-- Clear any sensitive transaction data
UPDATE payment_transaction
   SET hdfc_upi_qr_code = NULL,
       hdfc_upi_qr_string = NULL
 WHERE provider_code = 'hdfc_upi';
