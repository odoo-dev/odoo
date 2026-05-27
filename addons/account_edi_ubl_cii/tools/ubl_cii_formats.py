XML_FORMATS_METADATA = {
    'facturx': {
        'current_version': 'TODO',
        'supported_networks': None,
        'process_types': ['billing'],
        'document_types': ['invoice', 'credit_note'],
        'countries': ['FR'],
        'module': 'account_edi_ubl_cii',
        'builder_class': 'account.edi.xml.cii',
    },
    'zugferd': {
        'current_version': 'TODO',
        'supported_networks': None,
        'process_types': ['billing'],
        'document_types': ['invoice', 'credit_note'],
        'countries': ['DE'],
        'module': 'account_edi_ubl_cii',
        'builder_class': 'account.edi.xml.cii',
    },
    'xrechnung': {
        # xrenchnung should only be use when invoicing to government/public entities
        'sequence': 200,
        'current_version': 'TODO',
        'supported_networks': ['peppol'],
        'process_types': ['billing'],
        'document_types': ['invoice', 'credit_note'],
        'countries': ['DE'],
        'module': 'account_edi_ubl_cii',
        'builder_class': 'account.edi.xml.ubl_de',
    },
    'ubl_bis3': {
        'sequence': 200,  # other local formats should take precedence if any
        'current_version': 'TODO',
        'supported_networks': ['peppol'],
        'process_types': ['billing', 'selfbilling'],
        'document_types': ['invoice', 'credit_note'],
        'countries': PEPPOL_DEFAULT_COUNTRIES,
        'module': 'account_edi_ubl_cii',
        'builder_class': 'account.edi.xml.ubl_bis3',
        'embed_attachments': True,
    },
    'nlcius': {
        'current_version': 'TODO',
        'supported_networks': ['peppol'],
        'process_types': ['billing', 'selfbilling'],
        'document_types': ['invoice', 'credit_note'],
        'countries': ['NL'],
        'module': 'account_edi_ubl_cii',
        'builder_class': 'account.edi.xml.ubl_nl',
    },
    # TODO add pint/etc
}
