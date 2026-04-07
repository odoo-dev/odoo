def migrate(cr, version):
    # Migrate l10n_no_bronnoysund_number → additional_identifiers NO_EN
    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object('NO_EN', l10n_no_bronnoysund_number)
         WHERE l10n_no_bronnoysund_number IS NOT NULL
           AND l10n_no_bronnoysund_number != ''
    """)
