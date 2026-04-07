def migrate(cr, version):
    # Migrate peppol_eas + peppol_endpoint to additional_identifiers.
    # Only migrate when the endpoint value is NOT already the partner's VAT
    # (VAT-type EAS codes like 9925, 9930, 9957 etc. just pointed to the VAT field).
    #
    # For non-VAT EAS codes, look up the identifier key and store in additional_identifiers.
    # The mapping is from IDENTIFIERS_METADATA's iso6523 → key.
    #
    # We skip rows where peppol_endpoint already matches the vat (case-insensitive)
    # to avoid duplicating VAT data into additional_identifiers.

    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object(
                                            CASE peppol_eas
                                                WHEN '0002' THEN 'FR_SIREN'
                                                WHEN '0007' THEN 'SE_EN'
                                                WHEN '0009' THEN 'FR_SIRET'
                                                WHEN '0060' THEN 'DUNS'
                                                WHEN '0088' THEN 'EAN_GLN'
                                                WHEN '0096' THEN 'DK_P'
                                                WHEN '0106' THEN 'NL_KVK'
                                                WHEN '0130' THEN 'EU_DIR'
                                                WHEN '0183' THEN 'CH_EN'
                                                WHEN '0184' THEN 'DK_EN'
                                                WHEN '0190' THEN 'NL_OIN'
                                                WHEN '0191' THEN 'EE_EN'
                                                WHEN '0192' THEN 'NO_EN'
                                                WHEN '0195' THEN 'SG_UEN'
                                                WHEN '0196' THEN 'IS_EN'
                                                WHEN '0199' THEN 'LEI'
                                                WHEN '0200' THEN 'LT_EN'
                                                WHEN '0201' THEN 'IT_IPA'
                                                WHEN '0202' THEN 'IT_PEC'
                                                WHEN '0204' THEN 'DE_LTW'
                                                WHEN '0208' THEN 'BE_EN'
                                                WHEN '0209' THEN 'GS1'
                                                WHEN '0210' THEN 'IT_CF'
                                                WHEN '0211' THEN 'IT_VAT'
                                                WHEN '0216' THEN 'FI_OVT'
                                                WHEN '0218' THEN 'LV_EN'
                                                WHEN '0221' THEN 'JP_IIN'
                                                WHEN '0230' THEN 'MY_EN'
                                                WHEN '0235' THEN 'AE_TIN'
                                                WHEN '0244' THEN 'NG_TIN'
                                                WHEN '0245' THEN 'SK_DIC'
                                                WHEN '0246' THEN 'DE_EBA'
                                                ELSE peppol_eas
                                            END,
                                            peppol_endpoint
                                        )
         WHERE peppol_eas IS NOT NULL
           AND peppol_endpoint IS NOT NULL
           AND peppol_endpoint != ''
           AND (vat IS NULL OR LOWER(peppol_endpoint) != LOWER(vat))
    """)
