
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools import SQL


class ProductDocument(models.Model):
    _name = 'product.document'
    _description = "Product Document"
    _inherits = {
        'ir.attachment': 'ir_attachment_id',
    }
    _order = 'sequence, name'

    ir_attachment_id = fields.Many2one(
        'ir.attachment',
        string="Related attachment",
        required=True,
        index=True,
        ondelete='cascade')

    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)
    variant_attribute_value_ids = fields.Many2many(
        'product.template.attribute.value',
        compute='_compute_variant_attribute_value_ids',
    )

    product_id = fields.Many2one('product.product', compute='_compute_product_product_id', compute_sql='_compute_sql_product_product_id', compute_sudo=True)
    product_tmpl_id = fields.Many2one('product.product', compute='_compute_product_template_id', compute_sql='_compute_sql_product_template_id', compute_sudo=True)

    @api.depends('model', 'res_id')
    def _compute_product_product_id(self):
        for doc in self:
            doc.product_id = doc.res_id if doc.model == 'product.product' else False

    def _compute_sql_product_product_id(self, table):
        attachment = table.ir_attachment_id
        return SQL("CASE WHEN %s = 'product.product' THEN %s END", attachment.res_model, attachment.res_id)

    @api.depends('model', 'res_id', 'product_id.product_tmpl_id')
    def _compute_product_template_id(self):
        for doc in self:
            doc.product_id = doc.res_id if doc.model == 'product.template' else doc.product_id.product_tmpl_id

    def _compute_sql_product_template_id(self, table):
        attachment = table.ir_attachment_id
        product_alias = table._make_alias('product_product')
        table._query.add_join('LEFT JOIN', product_alias, self.env.registry['product.product']._table, SQL(
            "%s.id = %s AND %s = 'product.product'",
            SQL.identifier(product_alias),
            table.res_id,
            table.model,
        ))
        return SQL("""CASE
            WHEN %(model)s = 'product.template' THEN %(res_id)s
            WHEN %(model)s = 'product.product' THEN %(product_id)s
            END""", model=attachment.res_model, res_id=attachment.res_id, product_id=SQL.identifier(product_alias, 'product_tmpl_id'))

    @api.depends('res_model', 'res_id')
    def _compute_variant_attribute_value_ids(self):
        Product = self.env['product.product']
        self.variant_attribute_value_ids = False
        for document in self:
            if document.res_model == 'product.product' and document.res_id:
                product = Product.browse(document.res_id)
                document.variant_attribute_value_ids = product.product_template_attribute_value_ids

    @api.onchange('url')
    def _onchange_url(self):
        for attachment in self:
            if attachment.type == 'url' and attachment.url and\
                not attachment.url.startswith(('https://', 'http://', 'ftp://')):
                raise ValidationError(_(
                    "Please enter a valid URL.\nExample: https://www.odoo.com\n\nInvalid URL: %s",
                    attachment.url
                ))

    #=== CRUD METHODS ===#

    @api.model_create_multi
    def create(self, vals_list):
        return super(
            ProductDocument,
            self.with_context(disable_product_documents_creation=True),
        ).create(vals_list)

    def copy_data(self, default=None):
        vals_list = super().copy_data(default=default)
        ir_default = default
        if ir_default:
            ir_fields = list(self.env['ir.attachment']._fields)
            ir_default = {field : default[field] for field in default if field in ir_fields}
        for document, vals in zip(self, vals_list):
            vals['ir_attachment_id'] = document.ir_attachment_id.with_context(
                no_document=True,
                disable_product_documents_creation=True,
            ).copy(ir_default).id
        return vals_list

    def unlink(self):
        attachments = self.ir_attachment_id
        res = super().unlink()
        return res and attachments.unlink()
