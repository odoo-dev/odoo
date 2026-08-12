from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    def _default_pos_config(self):
        # Default to the last modified pos.config.
        active_model = self.env.context.get('active_model', '')
        if active_model == 'pos.config':
            return self.env.context.get('active_id')
        return self.env['pos.config'].search([('company_id', '=', self.env.company.id)], order='write_date desc', limit=1)

    pos_config_id = fields.Many2one('pos.config', string="Point of Sale", default=lambda self: self._default_pos_config())
    sale_tax_id = fields.Many2one('account.tax', string="Default Sale Tax", related='company_id.account_sale_tax_id', readonly=False, check_company=True)
    module_l10n_at_pos = fields.Boolean(string="Austria Fiscalization", help="Configure Fiskaly credentials required for Austrian RKSV fiscalization")
    module_pos_adyen = fields.Boolean(string="Adyen Payment Terminal", help="The transactions are processed by Adyen. Set your Adyen credentials on the related payment method.")
    module_pos_stripe = fields.Boolean(string="Stripe Payment Terminal", help="The transactions are processed by Stripe. Set your Stripe credentials on the related payment method.")
    module_pos_viva_com = fields.Boolean(string="Viva.com Payment Terminal", help="The transactions are processed by Viva.com on terminal or tap on phone.")
    module_pos_razorpay = fields.Boolean(string="Razorpay Payment Terminal", help="The transactions are processed by Razorpay. Set your Razorpay credentials on the related payment method.")
    module_pos_mercado_pago = fields.Boolean(string="Mercado Pago Payment Terminal", help="The transactions are processed by Mercado Pago. Set your Mercado Pago credentials on the related payment method.")
    module_pos_pine_labs = fields.Boolean(string="Pine Labs Payment Terminal", help="The transactions are processed by Pine Labs. Set your Pine Labs credentials on the related payment method.")
    module_pos_qfpay = fields.Boolean(string="QFPay Payment Terminal", help="The transactions are processed by QFPay. Set your QFPay credentials on the related payment method.")
    module_pos_dpopay = fields.Boolean(string="DPO Pay Payment Terminal", help="The transactions are processed by DPO Pay. Set your DPO Pay credentials on the related payment method.")
    module_pos_pricer = fields.Boolean(string="Pricer electronic price tags", help="Display the price of your products through electronic price tags")
    barcode_nomenclature_id = fields.Many2one('barcode.nomenclature', related='company_id.nomenclature_id', readonly=False)
    point_of_sale_use_ticket_qr_code = fields.Boolean(related='company_id.point_of_sale_use_ticket_qr_code', readonly=False)
    point_of_sale_ticket_unique_code = fields.Boolean(related='company_id.point_of_sale_ticket_unique_code', readonly=False)
    point_of_sale_ticket_portal_url_display_mode = fields.Selection(related='company_id.point_of_sale_ticket_portal_url_display_mode', readonly=False, required=True)
    group_pos_preset = fields.Boolean(string="Presets", implied_group="point_of_sale.group_pos_preset", help="Hide or show the Presets menu in the Point of Sale configuration.")

    def set_values(self):
        super().set_values()
        # Disabling the feature company-wide must also disable it on every PoS,
        # otherwise the PoS keeps using a pricelist / rounding the user can no
        # longer see nor edit.
        if not self.group_product_pricelist:
            self.env['pos.config'].search([('use_pricelist', '=', True)]).use_pricelist = False

        if not self.group_cash_rounding:
            self.env['pos.config'].search([('cash_rounding', '=', True)]).cash_rounding = False

    def open_payment_method_form(self):
        bank_journal = self.env['account.journal'].search([('type', '=', 'bank'), ('company_id', 'in', self.env.company.parent_ids.ids)], limit=1)
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'pos.payment.method',
            'views': [(False, 'form')],
            'target': 'current',
            'context': {
                'default_config_ids': self.pos_config_id.ids,
                'default_payment_method_type': 'terminal',
                'default_payment_provider': self.env.context.get('selection', False),
                'default_journal_id': bank_journal.id if bank_journal else False,
                'default_name': f"Bank {self.env.context.get('provider_name', False)}",
            }
        }
