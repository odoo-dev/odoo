from odoo import api, fields, models


class PosOrder(models.Model):
    _inherit = "pos.order"

    l10n_sa_invoice_qr_code_str = fields.Char(related="account_move.l10n_sa_qr_code_str", string="ZATCA QR Code")
    l10n_sa_invoice_edi_state = fields.Selection(related="account_move.edi_state", string="Electronic invoicing")

    def _l10n_sa_get_pos_zatca_data(self):
        """ Read the ZATCA data of the linked invoice.

            Both fields are related to ``account.move``, whose QR code is computed from the EDI
            document and its attachment. The cashier has no access to those, so this is read with
            elevated privileges; nothing but the QR code of the order's own invoice is exposed.
        """
        self.ensure_one()
        order_sudo = self.sudo()
        return {
            'l10n_sa_invoice_qr_code_str': order_sudo.l10n_sa_invoice_qr_code_str,
            'l10n_sa_invoice_edi_state': order_sudo.l10n_sa_invoice_edi_state,
        }

    @api.model
    def create_from_ui(self, orders, draft=False):
        """ 17.0 does not reload the ``pos.order`` records in the frontend after syncing them,
            so the ZATCA data of the freshly created invoice has to travel back with the sync
            response for the receipt to be able to display the Phase 2 QR code.
        """
        res = super().create_from_ui(orders, draft)
        if self.env.company.country_id.code == 'SA':
            orders_by_id = {order.id: order for order in self.browse([order_data['id'] for order_data in res])}
            for order_data in res:
                order = orders_by_id.get(order_data['id'])
                if order:
                    order_data.update(order._l10n_sa_get_pos_zatca_data())
        return res

    def _export_for_ui(self, order):
        """ Same as ``create_from_ui``, but for orders loaded back in the frontend, so that
            reprinting the receipt of a past order also shows the Phase 2 QR code.
        """
        res = super()._export_for_ui(order)
        if order.company_id.country_id.code == 'SA':
            res.update(order._l10n_sa_get_pos_zatca_data())
        return res

    def _generate_pos_order_invoice(self):
        # When generate_pdf=False (set by the SA ZATCA POS UI to avoid blocking checkout
        # on wkhtmltopdf), super() skips _generate_and_send entirely — including ZATCA.
        # We restore ZATCA EDI processing here since it is legally required to run synchronously.
        # PDF is left for on-demand generation when the invoice is first viewed or downloaded.
        if self.env.context.get('generate_pdf', True) or self.company_id.country_id.code != 'SA':
            return super()._generate_pos_order_invoice()

        orders_needing_invoice = self.filtered(lambda o: not o.account_move)
        result = super()._generate_pos_order_invoice()

        for order in orders_needing_invoice:
            if order.account_move:
                order.account_move.sudo().edi_document_ids.filtered(
                    lambda d: d.state == 'to_send' and d.edi_format_id._needs_web_services()
                )._process_documents_web_services(with_commit=False)

        return result
