from odoo.addons.account_edi_ubl_cii.tests.common import TestUblCiiCommon
from odoo.addons.account_edi_ubl_cii.models.account_edi_xml_ubl_bis3 import CHORUS_PRO_PEPPOL_ID


class TestUblCiiCommonChorusPro(TestUblCiiCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner_fr_chorus_pro = cls._create_partner_fr_chorus_pro()

    @classmethod
    def _create_partner_fr_chorus_pro(cls, **kwargs):
        _chorus_eas, _sep, chorus_endpoint = CHORUS_PRO_PEPPOL_ID.partition(":")
        return cls.env['res.partner'].create({
            **cls._create_partner_default_values(),
            'name': "Chorus Pro - Commune de Nantes",
            # Commune de Nantes
            'vat': "FR74214401093",
            'company_registry': "21440109300015",
            # Peppol ID for the AIFE (= Chorus Pro)
            'additional_identifiers': {'FR_SIRET': chorus_endpoint},
            'country_id': cls.env.ref('base.fr').id,
            **kwargs,
        })
