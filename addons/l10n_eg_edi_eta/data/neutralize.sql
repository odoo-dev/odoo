-- disable l10n_eg_edi_eta integration
UPDATE res_company
   SET l10n_eg_edi_demo_mode = true,
       l10n_eg_client_secret = 'dummy';
