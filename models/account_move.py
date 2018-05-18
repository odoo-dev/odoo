from odoo import fields, models, api
# from odoo.exceptions import UserError
from odoo.osv import expression


class AccountMove(models.Model):
    """
    about name_get and display name:
    * in this model name_get and name_search are re-defined so we overwrite
    them
    * we add display_name to replace name field use, we add
     with search funcion. This field is used then for name_get and name_search


    Acccoding this https://www.odoo.com/es_ES/forum/ayuda-1/question/
    how-to-override-name-get-method-in-new-api-61228
    we should modify name_get, we do that by creating a helper display_name
    field and also overwriting name_get to use it
    """
    _inherit = "account.move"

    document_type_id = fields.Many2one(
        'account.document.type',
        'Document Type',
        copy=False,
        auto_join=True,
        states={'posted': [('readonly', True)]},
        index=True,
    )
    document_number = fields.Char(
        string='Document Number',
        copy=False,
        states={'posted': [('readonly', True)]},
        index=True,
    )
    # this fields exists automatically and was computed by name_get,
    # no we compute with a function so it can be computed by document
    # we store it so we can search over it. we dont make a name_search directly
    # over document_number becaouse we want to search with wildcards
    # using doc_code_prefix, for eg, 'fa-a%0001%'
    display_name = fields.Char(
        compute='_compute_display_name',
        # queremos eviatar recargar esta clase por ahora, si activamos
        # desactivar el dpends de prefix
        store=True,
        index=True,
    )

    @api.multi
    @api.depends(
        'document_number',
        'name',
        'document_type_id',
        # we disable this depnd because it makes update performance low
        # 'document_type_id.doc_code_prefix',
    )
    def _compute_display_name(self):
        for rec in self:
            if rec.document_number and rec.document_type_id:
                display_name = (
                    rec.document_type_id.doc_code_prefix or '') + \
                    rec.document_number
            else:
                # si tiene solo document number, lo usamos
                display_name = rec.document_number or rec.name
            rec.display_name = display_name

    @api.multi
    @api.depends(
        'name', 'state',
        'document_number', 'document_type_id.doc_code_prefix')
    def name_get(self):
        """
        We overwrite default name_get function to use document_number if
        available
        """
        result = []
        for move in self:
            if move.state == 'draft':
                name = '* ' + str(move.id)
            else:
                name = move.display_name
            result.append((move.id, name))
        return result

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        """
        We add so it search by name and by document_number
        This is used, for eg, when we search a move on a m2o field
        We first search by display name that is computed by
        document_number (if exists) or name. We also search by name
        """
        args = args or []
        domain = []
        if name:
            domain = [
                '|',
                ('display_name', operator, name),
                # ('document_number', operator, name),
                ('name', operator, name)]
            if operator in expression.NEGATIVE_TERM_OPERATORS:
                domain = ['&', '!'] + domain[1:]
        recs = self.search(domain + args, limit=limit)
        return recs.name_get()
