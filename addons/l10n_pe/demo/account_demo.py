from datetime import datetime, timedelta
from odoo import Command, models
from odoo.addons.account.models.chart_template import template


class AccountChartTemplate(models.AbstractModel):
    _inherit = "account.chart.template"

    _account__account_payment_term_end_following_month = models.Ref('account.account_payment_term_end_following_month', 'account.payment.term', required=False)
    _base__res_partner_12 = models.Ref('base.res_partner_12', 'res.partner', required=False)
    _base__res_partner_2 = models.Ref('base.res_partner_2', 'res.partner', required=False)
    _base__user_demo = models.Ref('base.user_demo', 'res.users', required=False)
    _l10n_pe__document_type08_optional = models.Ref('l10n_pe.document_type08', 'l10n_latam.document.type', required=False)
    _l10n_pe__document_type50 = models.Ref('l10n_pe.document_type50', 'l10n_latam.document.type', required=False)
    _l10n_pe__document_type91 = models.Ref('l10n_pe.document_type91', 'l10n_latam.document.type', required=False)
    _product__consu_delivery_03 = models.Ref('product.consu_delivery_03', 'product.product', required=False)
    _product__product_delivery_01 = models.Ref('product.product_delivery_01', 'product.product', required=False)

    @template(model='account.move', demo=True)
    def _get_demo_data_move(self, template_code):
        def _get_tax_by_code(code, type_tax='sale'):
            taxes = self.env['account.tax'].search([
                ('type_tax_use', '=', type_tax), ('l10n_pe_edi_tax_code', '=', code)], limit=1)
            return [Command.set(taxes.ids)]

        move_data = super()._get_demo_data_move(template_code)
        last_month_date = datetime.strptime(move_data[self.company_xmlid('demo_invoice_1')]['invoice_date'], '%Y-%m-%d') - timedelta(days=1)
        if template_code == "pe":
            move_data[self.company_xmlid('demo_invoice_1')]['invoice_date'] = last_month_date
            move_data[self.company_xmlid('demo_invoice_1')]['l10n_latam_document_number'] = 'FFF-0000001'
            move_data[self.company_xmlid('demo_invoice_1')]['invoice_line_ids'] = [
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 25000.0, 'price_unit': 3.0, 'tax_ids': _get_tax_by_code('9997')}),
            ]
            move_data[self.company_xmlid('demo_invoice_2')]['invoice_date'] = last_month_date
            move_data[self.company_xmlid('demo_invoice_2')]['l10n_latam_document_number'] = 'FFF-0000002'
            move_data[self.company_xmlid('demo_invoice_2')]['invoice_line_ids'] = [
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 12500.0, 'price_unit': 3.0, 'tax_ids': _get_tax_by_code('1000')}),
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 1000.0, 'tax_ids': _get_tax_by_code('9997')}),
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 1500.0, 'tax_ids': _get_tax_by_code('9998')}),
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 12500.0, 'price_unit': 3.0, 'tax_ids': _get_tax_by_code('1000')}),
            ]
            move_data[self.company_xmlid('demo_invoice_3')]['invoice_date'] = last_month_date
            move_data[self.company_xmlid('demo_invoice_3')]['l10n_latam_document_type_id'] = self._l10n_pe__document_type08_optional.id
            move_data[self.company_xmlid('demo_invoice_3')]['l10n_latam_document_number'] = 'NDI-0000001'
            move_data[self.company_xmlid('demo_invoice_3')]['invoice_line_ids'] = [
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 12500.0, 'price_unit': 3.0, 'tax_ids': _get_tax_by_code('1000')}),
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 1000.0, 'tax_ids': _get_tax_by_code('9997')}),
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 1500.0, 'tax_ids': _get_tax_by_code('9998')}),
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 12500.0, 'price_unit': 3.0, 'tax_ids': _get_tax_by_code('1000')}),
            ]
            move_data[self.company_xmlid('demo_invoice_followup')]['move_type'] = 'in_invoice'
            move_data[self.company_xmlid('demo_invoice_followup')]['partner_id'] = self._base__res_partner_2.id
            move_data[self.company_xmlid('demo_invoice_followup')]['invoice_date'] = last_month_date
            move_data[self.company_xmlid('demo_invoice_followup')]['l10n_latam_document_number'] = 'FFF-100001'
            move_data[self.company_xmlid('demo_invoice_followup')]['invoice_line_ids'] = [
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 500.0}),
            ]
            move_data[self.company_xmlid('demo_invoice_5')]['partner_id'] = self._base__res_partner_2.id
            move_data[self.company_xmlid('demo_invoice_5')]['invoice_date'] = last_month_date
            move_data[self.company_xmlid('demo_invoice_5')]['l10n_latam_document_number'] = 'FFF-100002'
            move_data[self.company_xmlid('demo_invoice_5')]['invoice_line_ids'] = [
                Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 500.0, 'tax_ids': _get_tax_by_code('1000', 'purchase')}),
            ]
            igv_gyng_tax = self.env['account.tax'].search([('type_tax_use', '=', 'purchase'), ('tax_group_id.name', '=', 'IGV GyNG')], limit=1)
            move_data[self.company_xmlid('demo_invoice_equipment_purchase')]['partner_id'] = self._base__res_partner_2.id
            move_data[self.company_xmlid('demo_invoice_equipment_purchase')]['invoice_date'] = last_month_date
            move_data[self.company_xmlid('demo_invoice_equipment_purchase')]['l10n_latam_document_number'] = 'FFF-100003'
            move_data[self.company_xmlid('demo_invoice_equipment_purchase')]['invoice_line_ids'] = [
                Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 500.0, 'quantity': 1, 'tax_ids': [Command.set(igv_gyng_tax.ids)]}),
            ]
            move_data[self.company_xmlid('demo_invoice_6')] = {
                'move_type': 'in_invoice',
                'partner_id': self._base__res_partner_2.id,
                'invoice_user_id': self._base__user_demo.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': 'FFF-100004',
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 500.0, 'quantity': 1, 'tax_ids': _get_tax_by_code('9997', 'purchase')}),
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 1000.0, 'quantity': 1, 'tax_ids': _get_tax_by_code('1000', 'purchase')}),
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 1500.0, 'quantity': 2, 'tax_ids': _get_tax_by_code('9996', 'purchase')}),
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 2000.0, 'quantity': 1, 'tax_ids': _get_tax_by_code('9998', 'purchase')}),
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 2500.0, 'quantity': 1, 'tax_ids': _get_tax_by_code('1000', 'purchase')}),
                ],
            }
            move_data[self.company_xmlid('demo_invoice_7')] = {
                'move_type': 'in_invoice',
                'partner_id': self._base__res_partner_12.id,
                'invoice_user_id': self._base__user_demo.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': 'FFF-000005',
                'l10n_latam_document_type_id': self._l10n_pe__document_type91.id,
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 25000.0, 'quantity': 3, 'tax_ids': _get_tax_by_code('9995', 'purchase')}),
                ],
            }
            move_data[self.company_xmlid('demo_invoice_8')] = {
                'move_type': 'in_invoice',
                'partner_id': self._base__res_partner_12.id,
                'invoice_user_id': self._base__user_demo.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': '118-145266',
                'l10n_latam_document_type_id': self._l10n_pe__document_type50.id,
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 3, 'quantity': 25000.0, 'tax_ids': _get_tax_by_code('9995', 'purchase')}),
                ],
            }
            move_data[self.company_xmlid('demo_invoice_9')] = {
                'move_type': 'in_invoice',
                'partner_id': self._base__res_partner_12.id,
                'invoice_user_id': self._base__user_demo.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': 'FFF-100009',
                'l10n_latam_document_type_id': self._l10n_pe__document_type91.id,
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__product_delivery_01.id, 'price_unit': 3, 'quantity': 25000.0, 'tax_ids': _get_tax_by_code('9995', 'purchase')}),
                ],
            }
            move_data[self.company_xmlid('demo_invoice_10')] = {
                'move_type': 'out_refund',
                'partner_id': self._base__res_partner_12.id,
                'invoice_user_id': self._base__user_demo.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': 'CNE-0000001',
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 25000.0, 'price_unit': 3.0, 'tax_ids': _get_tax_by_code('9997')}),
                ],
            }
            move_data[self.company_xmlid('demo_invoice_11')] = {
                'move_type': 'in_refund',
                'partner_id': self._base__res_partner_12.id,
                'invoice_user_id': self._base__user_demo.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': 'FFF-100005',
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 500.0}),
                ],
            }
            move_data[self.company_xmlid('demo_invoice_12')] = {
                'move_type': 'in_invoice',
                'partner_id': self._base__res_partner_12.id,
                'invoice_user_id': self._base__user_demo.id,
                'l10n_latam_document_type_id': self._l10n_pe__document_type08_optional.id,
                'invoice_payment_term_id': self._account__account_payment_term_end_following_month.id,
                'invoice_date': last_month_date,
                'l10n_latam_document_number': 'FFF-100006',
                'invoice_line_ids': [
                    Command.create({'product_id': self._product__consu_delivery_03.id, 'quantity': 1.0, 'price_unit': 500.0}),
                ],
            }
            move_data[self.company_xmlid('demo_move_auto_reconcile_3')]['l10n_latam_document_number'] = 'FFF-100007'
            move_data[self.company_xmlid('demo_move_auto_reconcile_4')]['l10n_latam_document_number'] = 'FFF-100008'
        return move_data
