def migrate(cr, version):
    # Migrate l10n_it_codice_fiscale → additional_identifiers IT_CF
    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object('IT_CF', l10n_it_codice_fiscale)
         WHERE l10n_it_codice_fiscale IS NOT NULL
           AND l10n_it_codice_fiscale != ''
    """)
    # Migrate l10n_it_pa_index → additional_identifiers IT_IPA
    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object('IT_IPA', l10n_it_pa_index)
         WHERE l10n_it_pa_index IS NOT NULL
           AND l10n_it_pa_index != ''
    """)
    # Migrate l10n_it_pec_email → additional_identifiers IT_PEC
    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object('IT_PEC', l10n_it_pec_email)
         WHERE l10n_it_pec_email IS NOT NULL
           AND l10n_it_pec_email != ''
    """)
