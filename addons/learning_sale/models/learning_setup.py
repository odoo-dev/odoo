from odoo import Command, models

SALES_APPS = ('sale.sale_menu_root',)
QUOTATIONS_ACTION = 'sale.action_quotations_with_onboarding'


class LearningSetup(models.AbstractModel):
    _inherit = 'learning.setup'

    # ------------------------------------------------------------
    # Practice data: a customer, two products, a journal kept apart
    # ------------------------------------------------------------

    def _practice_customer(self):
        # example.com never receives anything: nothing is sent to anyone
        return self._practice_record('res.partner', {'name': self.env._("Jean Dupont"), 'email': 'jean.dupont@example.com'})

    def _practice_products(self):
        pipe = self._practice_record('product.template', {'name': self.env._("Copper pipe 15mm"), 'list_price': 8.5})
        labour = self._practice_record('product.template', {
            'name': self.env._("Labour (per hour)"),
            'type': 'service',
            'list_price': 45,
            'uom_id': self.env.ref('uom.product_uom_hour').id,
        })
        return pipe, labour

    def _practice_journal(self, journal_type, name, code):
        """Practice invoices go to their own journal: real invoice numbers
        are not used, and they can be removed afterwards."""
        journal = self._practice_record('account.journal', {
            'name': name,
            'type': journal_type,
            'code': code,
            'restrict_mode_hash_table': False,
        })
        if journal.default_account_id:
            self.env['learning.practice.record'].register('account.account', journal.default_account_id.ids)
        return journal

    def _practice_quote(self):
        """A new practice quote for Jean, with a pipe and two hours of labour."""
        pipe, labour = self._practice_products()
        order = self.env['sale.order'].create({
            'partner_id': self._practice_customer().id,
            'journal_id': self._practice_journal('sale', self.env._("Practice Sales"), 'PRSAL').id,
            'order_line': [
                Command.create({'product_id': pipe.product_variant_id.id, 'product_uom_qty': 3}),
                Command.create({'product_id': labour.product_variant_id.id, 'product_uom_qty': 2}),
            ],
        })
        self.env['learning.practice.record'].register('sale.order', order.ids)
        return order

    # ------------------------------------------------------------
    # Lessons
    # ------------------------------------------------------------

    def _setup_first_quote_start(self):
        self._practice_customer()
        self._practice_products()
        return self._menu_location('sale.order', QUOTATIONS_ACTION, SALES_APPS)

    def _setup_quote_sections_start(self):
        self._practice_products()
        order = self.env['sale.order'].create({'partner_id': self._practice_customer().id})
        self.env['learning.practice.record'].register('sale.order', order.ids)
        return self._form_location(order, QUOTATIONS_ACTION)

    def _setup_document_life_start(self):
        return {
            'location': self._form_location(self._practice_quote(), QUOTATIONS_ACTION),
            'params': {'labourName': self._practice_products()[1].name},
        }
