from odoo import models, api, fields
# from odoo.exceptions import UserError
from odoo.osv import expression
from odoo.addons.account.models import account_move

old_method = account_move.AccountMoveLine.domain_move_lines_for_reconciliation


class AccountMoveLine(models.Model):
    """
    Show and allow to search by move display name (Document number) on
    bank statements and partner debt reconcile
    """

    _inherit = 'account.move.line'

    # useful to group by this field
    document_type_id = fields.Many2one(
        related='move_id.document_type_id',
        readonly=True,
        auto_join=True,
        # stored required to group by
        store=True,
        index=True,
    )

    @api.multi
    def prepare_move_lines_for_reconciliation_widget(
            self, target_currency=False, target_date=False):
        res = super(
            AccountMoveLine,
            self).prepare_move_lines_for_reconciliation_widget(
            target_currency=target_currency, target_date=target_date)
        for rec in res:
            line = self.browse(rec['id'])
            rec['name'] = (
                line.name != '/' and
                line.move_id.display_name + ': ' + line.name or
                line.move_id.display_name)
        return res

    @api.model
    def domain_move_lines_for_reconciliation(self, excluded_ids=None,
                                             str=False):
        """ Add move display name in search of move lines"""
        _super = super(AccountMoveLine, self)
        _get_domain = _super.domain_move_lines_for_reconciliation
        domain = _get_domain(excluded_ids=excluded_ids, str=str)
        if not str and str != '/':
            return domain
        domain_trans_ref = [('move_id.display_name', 'ilike', str)]
        return expression.OR([domain, domain_trans_ref])
