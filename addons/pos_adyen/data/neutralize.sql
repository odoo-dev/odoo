-- disable Adyen Payement POS integration
UPDATE pos_payment_provider
   SET mode = 'test';
