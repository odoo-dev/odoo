"""
The EXTRA_EU_TAG_MAP answers the question: "which tag should I apply on the OSS tax repartition line?"

{
    'fiscal_country_code': {
        'invoice_base_tag': xml_id_of_the_tag or None,
        'invoice_tax_tag': xml_id_of_the_tag or None,
        'refund_base_tag': xml_id_of_the_tag or None,
        'refund_tax_tag': xml_id_of_the_tag or None,
    },
}
"""

EXTRA_EU_TAG_MAP = {
}
