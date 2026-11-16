from odoo import fields

from odoo.addons.account_edi_cii.tests.common import TestUblCiiCommon


class TestUblBis3Common(TestUblCiiCommon):

    _test_user_groups = None  # FIXME list needed groups

    @classmethod
    def _create_partner_default_values(cls):
        values = super()._create_partner_default_values()
        values['invoice_edi_format'] = 'ubl_bis3'
        return values

    def _create_sdd_mandate(self, partner, account_number, start_date=None, end_date=None):
        partner_bank = self.env['res.partner.bank'].create({
            'account_number': account_number,
            'partner_id': partner.id,
            'company_id': self.env.company.id,
            'allow_out_payment': True,
        })
        mandate = self.env['account.direct.debit.mandate'].create({  # noqa: OLS03001
            'mandate_type': 'sepa',
            'name': f'mandate_{partner.name}_{account_number[-4:]}',
            'partner_id': partner.id,
            'partner_bank_id': partner_bank.id,
            'start_date': start_date or fields.Date.today(),
            'end_date': end_date,
            'company_id': self.env.company.id,
        })
        mandate.action_validate_mandate()

    # -------------------------------------------------------------------------
    # EXPORT HELPERS
    # -------------------------------------------------------------------------

    @classmethod
    def subfolders(cls):
        _subfolder_format, subfolder_document, subfolder_country = super().subfolders()
        return 'bis3', subfolder_document, subfolder_country
