# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models

DISPLAY_TYPES = [
    ("line_section", "Section"),
    ("line_subsection", "Subsection"),
    ("line_note", "Note"),
]


class OrderedProductLine(models.AbstractModel):
    _inherit = 'product.catalog.line.mixin'
    _name = 'ordered.product.line.mixin'
    _description = "Ordered product line with catalog abilities"

    # Implicitly required fields:
    #  * parent_id : m2o mapping to self
    #  * parent_field : m2o mapping to 'order' record

    display_type = fields.Selection(selection=DISPLAY_TYPES, help="Technical field for UX purpose.")
    sequence = fields.Integer(string="Sequence")

    # === COMPUTE METHODS === #

    def _compute_parent_id(self):
        parent_field = self._get_parent_field()
        parent_model_child_field = self._get_child_field_on_parent_model()
        sale_order_lines = set(self)
        for order, lines in self.grouped(parent_field).items():
            if not order:
                lines.parent_id = False
                continue

            last_section = False
            last_sub = False
            for line in order[parent_model_child_field].sorted('sequence'):
                if line.display_type == 'line_section':
                    last_section = line
                    if line in sale_order_lines:
                        line.parent_id = False
                    last_sub = False
                elif line.display_type == 'line_subsection':
                    if line in sale_order_lines:
                        line.parent_id = last_section
                    last_sub = line
                elif line in sale_order_lines:
                    line.parent_id = last_sub or last_section

    # === BUSINESS METHODS === #

    def _get_parent_field(self) -> str:
        # 'order_id'
        raise NotImplementedError

    def _get_parent_model(self) -> str:
        return self._fields[self._get_parent_field()].comodel_name

    def _get_child_field_on_parent_model(self) -> str:
        # 'order_line'
        raise NotImplementedError

    def _is_line_in_section(self, line):
        """Return whether the line is a direct or indirect child of the section."""
        self.ensure_one()
        is_direct_child = line.parent_id == self
        is_indirect_child = (
            self.display_type == "line_section"
            and line.parent_id
            and line.parent_id.display_type == "line_subsection"
            and line.parent_id.parent_id == self
        )
        return is_direct_child or is_indirect_child

    def _get_section_lines(self):
        self.ensure_one()
        return self[self._get_parent_field()][self._get_child_field_on_parent_model()].filtered(
            self._is_line_in_section
        )

    def _get_section_totals(self, totals_field):
        """Return the total/subtotal amount sale order lines linked to section."""
        self.ensure_one()
        section_lines = self._get_section_lines()
        return sum(section_lines.mapped(totals_field))

    # === CATALOG === #

    @api.readonly
    def action_add_from_catalog(self):
        order = self.env[self._get_parent_model()].browse(self.env.context.get('order_id'))
        return order.with_context(
            child_field=self._get_child_field_on_parent_model()
        ).action_add_from_catalog()

    def _consider_in_catalog(self, parent_record, *, section_id=None, **kwargs) -> bool:
        # Only consider the lines in the current section (if any)
        return super()._consider_in_catalog(parent_record, **kwargs) and (
            not parent_record._has_sections() or self._is_in_section(section_id)
        )

    def _is_in_section(self, section_id=None) -> bool:
        """Check if line belongs to given section or subsection in catalog."""
        self.ensure_one()

        section_id = section_id or self.env.context.get('section_id')
        if not section_id:
            # Line should not belong to any section.
            return not self.parent_id

        return self.browse(section_id)._is_line_in_section(self)

    def _get_product_catalog_lines_data(self, parent_record, **kwargs) -> dict:
        """Override of `product` to add the subtotal."""
        vals = super()._get_product_catalog_lines_data(parent_record, **kwargs)

        if parent_record._has_sections():
            vals["subtotal"] = sum(self.mapped("price_subtotal"))

        return vals
