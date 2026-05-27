from odoo.addons.account_edi_ubl_cii.tests.common import TestUblCiiCommon


class TestUblCiiCommonChorusPro(TestUblCiiCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner_fr_chorus_pro = cls._create_partner_fr_chorus_pro()

    @classmethod
    def _create_partner_fr_chorus_pro(cls, **kwargs):
        return cls.env['res.partner'].create({
            **cls._create_partner_default_values(),
            'name': "Chorus Pro - Commune de Nantes",
            # Commune de Nantes
            'vat': "FR74214401093",
            'is_behind_chorus_pro': True,
            'additional_identifiers': {'FR_SIRET': '21440109300015'},
            'country_id': cls.env.ref('base.fr').id,
            **kwargs,
        })
