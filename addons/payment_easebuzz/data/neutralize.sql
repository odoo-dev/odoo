-- disable easebuzz payment provider
UPDATE payment_provider
   SET easebuzz_key = NULL,
       easebuzz_salt = NULL;
