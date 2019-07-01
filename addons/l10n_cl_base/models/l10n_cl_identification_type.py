# Part of Odoo. See LICENSE file for full copyright and licensing details.
# todo: to deprecate
from odoo import _, api, fields, models
from odoo.osv import expression


class L10nCLIdentificationType(models.Model):
    _name = "l10n_cl.identification.type"
    _description = "Partner Identification Type used in Chile"
    _rec_name = "code"
    _order = "sequence"

    code = fields.Char(
        size=16,
        required=True,
        help="ID type abbreviation. i.e.: 'RUT'",
    )
    name = fields.Char(
        string="ID name",
        required=True,
        help="ID type name. i.e.: 'Cédula'",
    )
    active = fields.Boolean(
        default=True,
    )
    sequence = fields.Integer(
        default=10,
        required=True,
    )

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        """
        Identification type can be searched by code or name
        """
        args = args or []
        domain = []
        if name:
            domain = [
                '|',
                ('code', '=ilike', name + '%'),
                ('name', operator, name)]
            if operator in expression.NEGATIVE_TERM_OPERATORS:
                domain = ['&', '!'] + domain[1:]
        recs = self.search(domain + args, limit=limit)
        return recs.name_get()
