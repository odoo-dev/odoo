from odoo import fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_ar_arba_cit = fields.Char(
        string="CIT",
        groups='stock.group_stock_manager',
    )
    l10n_ar_arba_cot_environment = fields.Selection(
        selection=[
            ('demo', "Demo"),
            ('testing', "Testing"),
            ('production', "Production"),
        ],
        string="ARBA COT Environment",
        default='demo',
    )
    l10n_ar_arba_cot_next_file_number = fields.Integer(
        string="COT Next File Number",
        default=1,
        help="Sequence number used in the name of the next COT file sent to ARBA. "
             "It is updated after each file to keep the numbering continuous.",
    )

    def _l10n_ar_get_arba_cot_company(self):
        """ Return the closest company in the hierarchy, starting from itself, with a CUIT, whose CUIT and CIT are used for the COT. """
        self.ensure_one()
        return self.sudo().parent_ids[::-1].filtered('vat')[:1] or self.sudo()
