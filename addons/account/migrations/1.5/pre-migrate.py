def migrate(cr, version):
    # Ensure additional_identifiers column exists before downstream modules migrate
    cr.execute("""
        ALTER TABLE res_partner
        ADD COLUMN IF NOT EXISTS additional_identifiers jsonb
    """)
    # Migrate global_location_number → additional_identifiers GLN
    cr.execute("""
        UPDATE res_partner
           SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                     || jsonb_build_object('GLN', global_location_number)
         WHERE global_location_number IS NOT NULL
           AND global_location_number != ''
    """)
