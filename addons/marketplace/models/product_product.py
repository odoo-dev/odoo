# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class ProductProduct(models.Model):
    _inherit = 'product.product'

    marketplace_offer_ids = fields.One2many(comodel_name='marketplace.offer', inverse_name='matched_product_id')
    offer_count = fields.Integer(compute='_compute_offer_count')

    @api.depends('marketplace_offer_ids')
    def _compute_offer_count(self):
        self.offer_count = len(self.marketplace_offer_ids)

    def action_view_marketplace_offer(self):
        return {
            'name': "Marketplace Offer",
            'type': 'ir.actions.act_window',
            'res_model': 'marketplace.offer',
            'view_mode': 'list',
            'domain': [('matched_product_id', '=', self.id)],
            'context': {'group_by': 'marketplace_account_id'},
        }

    @api.model
    def _restore_data_product(self, default_name, default_type, xmlid):
        """ Create a product and assign it the provided and previously valid xmlid. """
        product = self.env['product.product'].with_context(mail_create_nosubscribe=True).create({
            'name': default_name,
            'type': default_type,
            'list_price': 0.,
            'sale_ok': False,
            'purchase_ok': False,
        })
        product._configure_for_marketplace()
        self.env['ir.model.data'].sudo().search(
            [('module', '=', 'marketplace'), ('name', '=', xmlid)]
        ).write({'res_id': product.id})
        return product

    def _configure_for_marketplace(self):
        """ Archive products and their templates and define their invoice policy. """
        # Archiving is achieved by the mean of write instead of action_archive to allow this method
        # to be called from data without restoring the products when they were already archived.
        self.write({'active': False})
        for product_template in self.product_tmpl_id:
            product_template.write({
                'active': False,
                'invoice_policy': 'order' if product_template.type == 'service' else 'delivery',
            })
