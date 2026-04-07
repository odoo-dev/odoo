def migrate(cr, version):
    # Migrate l10n_sg_unique_entity_number → additional_identifiers SG_UEN
    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object('SG_UEN', l10n_sg_unique_entity_number)
         WHERE l10n_sg_unique_entity_number IS NOT NULL
           AND l10n_sg_unique_entity_number != ''
    """)
