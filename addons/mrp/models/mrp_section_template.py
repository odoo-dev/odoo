# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.fields import Command


class MrpSectionTemplate(models.Model):
    """ A section saved from a bill of materials or a manufacturing order (from
    the menu of the section), to add it again with its components. Its quantities
    are for one unit of finished product. """
    _name = 'mrp.section.template'
    _description = 'Saved Section'
    _order = 'name, id'
    _check_company_auto = True

    name = fields.Char('Section Name', required=True)
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, index=True)
    product_qty = fields.Float('Quantity', digits='Product Unit', default=1.0)
    line_ids = fields.One2many('mrp.section.template.line', 'template_id', 'Components', copy=True)
    line_count = fields.Integer('# Components', compute='_compute_line_count')

    @api.depends('line_ids')
    def _compute_line_count(self):
        for template in self:
            template.line_count = len(template.line_ids)

    def add_to_document(self, res_model, res_id):
        """ Adds the section, with its components, to the document (a bill of
        materials or a manufacturing order), from its "Add a section" control. """
        self.ensure_one()
        if res_model not in ('mrp.bom', 'mrp.production'):
            raise UserError(_("Sections can only be added to bills of materials and manufacturing orders."))
        document = self.env[res_model].browse(res_id).exists()
        if not document:
            raise UserError(_("Save the document first."))
        document.check_access('write')
        if res_model == 'mrp.bom':
            self._add_to_bom(document)
        else:
            self._add_to_production(document)
        return True

    def _add_to_bom(self, bom):
        sequence = max(bom.bom_line_ids.mapped('sequence'), default=0) + 1
        commands = [Command.create({
            'display_type': 'line_section',
            'name': self.name,
            'product_qty': self.product_qty,
            'applied_product_qty': self.product_qty,
            'sequence': sequence,
        })]
        for line in self.line_ids:
            sequence += 1
            commands.append(Command.create({
                'product_id': line.product_id.id,
                'product_qty': line.product_qty * bom.product_qty,
                'uom_id': line.uom_id.id,
                'sequence': sequence,
            }))
        bom.bom_line_ids = commands

    def _add_to_production(self, production):
        if production.state in ('done', 'cancel'):
            raise UserError(_("You cannot add a section to a manufacturing order that is done or cancelled."))
        key = 'saved_%s_%s' % (self.id, len(production.production_section_ids) + 1)
        sequence = max(production.move_raw_ids.mapped('sequence'), default=0) + 1
        production.production_section_ids = [Command.create({
            'key': key,
            'name': self.name,
            'sequence': sequence,
            'product_qty': self.product_qty,
            'applied_product_qty': self.product_qty,
        })]
        move_values = []
        for line in self.line_ids:
            values = production._get_move_raw_values(line.product_id, line.product_qty * production.product_qty, line.uom_id)
            values.update({'production_section_key': key, 'sequence': sequence})
            sequence += 1
            move_values.append(values)
        production.move_raw_ids = [Command.create(values) for values in move_values]
        if production.state != 'draft':
            production.with_context(no_procurement=True)._autoconfirm_production()


class MrpSectionTemplateLine(models.Model):
    _name = 'mrp.section.template.line'
    _description = 'Component of a Saved Section'
    _order = 'sequence, id'
    _check_company_auto = True

    template_id = fields.Many2one('mrp.section.template', required=True, index=True, ondelete='cascade')
    company_id = fields.Many2one(related='template_id.company_id', store=True)
    sequence = fields.Integer(default=10)
    product_id = fields.Many2one('product.product', 'Component', required=True, check_company=True)
    product_qty = fields.Float('Quantity', digits='Product Unit', default=1.0)
    uom_id = fields.Many2one(
        'uom.uom', 'Unit', required=True,
        compute='_compute_uom_id', store=True, readonly=False, precompute=True)

    @api.depends('product_id')
    def _compute_uom_id(self):
        for line in self:
            if line.product_id and not line.uom_id:
                line.uom_id = line.product_id.uom_id
