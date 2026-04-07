def migrate(cr, version):
    # Migrate l10n_my_identification_type + l10n_my_identification_number → additional_identifiers MY_*
    # The type maps to an identifier code: BRN→MY_BRN, NRIC→MY_MYID, PASSPORT→MY_PASSPORT, ARMY→MY_ARMY
    type_to_code = {
        'BRN': 'MY_BRN',
        'NRIC': 'MY_MYID',
        'PASSPORT': 'MY_PASSPORT',
        'ARMY': 'MY_ARMY',
    }
    for id_type, code in type_to_code.items():
        cr.execute("""
            UPDATE res_partner
               SET additional_identifiers = COALESCE(additional_identifiers, '{}'::jsonb)
                                         || jsonb_build_object(%(code)s, l10n_my_identification_number)
             WHERE l10n_my_identification_type = %(type)s
               AND l10n_my_identification_number IS NOT NULL
               AND l10n_my_identification_number != ''
        """, {'code': code, 'type': id_type})

    # Also migrate from res_company (these were standalone fields, not related)
    for id_type, code in type_to_code.items():
        cr.execute("""
            UPDATE res_partner p
               SET additional_identifiers = COALESCE(p.additional_identifiers, '{}'::jsonb)
                                         || jsonb_build_object(%(code)s, c.l10n_my_identification_number)
              FROM res_company c
             WHERE c.partner_id = p.id
               AND c.l10n_my_identification_type = %(type)s
               AND c.l10n_my_identification_number IS NOT NULL
               AND c.l10n_my_identification_number != ''
               AND (p.additional_identifiers IS NULL
                    OR NOT p.additional_identifiers ? %(code)s)
        """, {'code': code, 'type': id_type})
