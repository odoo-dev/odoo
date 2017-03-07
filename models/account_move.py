# -*- coding: utf-8 -*-
from openerp import fields, models, api
# from openerp.exceptions import UserError
from openerp.osv import expression


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
        states={'posted': [('readonly', True)]}
    )
    document_number = fields.Char(
        string='Document Number',
        copy=False,
        states={'posted': [('readonly', True)]}
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
                display_name = rec.name
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


class AccountMoveLine(models.Model):
    _inherit = "account.move.line"


    # # @api.v8
    # def prepare_move_lines_for_reconciliation_widget(self, cr, uid, line_ids, target_currency=False, target_date=False):
    #     """ Returns move lines formatted for the manual/bank reconciliation widget

    #         :param target_currency: curreny you want the move line debit/credit converted into
    #         :param target_date: date to use for the monetary conversion
    #     """
    #     ret = super(AccountMoveLine, self).prepare_move_lines_for_reconciliation_widget(
    #         cr, uid, line_ids, target_currency=target_currency, target_date=target_date)
    #     print 'ret', ret
    #     return ret
        # context = dict(self._context or {})
        # ret = []

        # for line in self:
        #     company_currency = line.account_id.company_id.currency_id
        #     ret_line = {
        #         'id': line.id,
        #         'name': line.name != '/' and line.move_id.display_name + ': ' + line.name or line.move_id.display_name,
        #         'ref': line.move_id.ref or '',
        #         # For reconciliation between statement transactions and already registered payments (eg. checks)
        #         # NB : we don't use the 'reconciled' field because the line we're selecting is not the one that gets reconciled
        #         'already_paid': line.account_id.internal_type == 'liquidity',
        #         'account_code': line.account_id.code,
        #         'account_name': line.account_id.name,
        #         'account_type': line.account_id.internal_type,
        #         'date_maturity': line.date_maturity,
        #         'date': line.date,
        #         'journal_name': line.journal_id.name,
        #         'partner_id': line.partner_id.id,
        #         'partner_name': line.partner_id.name,
        #         'currency_id': (line.currency_id and line.amount_currency) and line.currency_id.id or False,
        #     }

        #     debit = line.debit
        #     credit = line.credit
        #     amount = line.amount_residual
        #     amount_currency = line.amount_residual_currency

        #     # For already reconciled lines, don't use amount_residual(_currency)
        #     if line.account_id.internal_type == 'liquidity':
        #         amount = abs(debit - credit)
        #         amount_currency = abs(line.amount_currency)

        #     # Get right debit / credit:
        #     target_currency = target_currency or company_currency
        #     line_currency = (line.currency_id and line.amount_currency) and line.currency_id or company_currency
        #     amount_currency_str = ""
        #     total_amount_currency_str = ""
        #     if line_currency != company_currency and target_currency == line_currency:
        #         # The payment currency is the invoice currency, but they are different than the company currency
        #         # We use the `amount_currency` computed during the invoice validation, at the invoice date
        #         # to avoid exchange gain/loss
        #         # e.g. an invoice of 100€ must be paid with 100€, whatever the company currency and the exchange rates
        #         total_amount = line.amount_currency
        #         actual_debit = debit > 0 and amount_currency or 0.0
        #         actual_credit = credit > 0 and -amount_currency or 0.0
        #         currency = line_currency
        #     else:
        #         # Either:
        #         #  - the invoice, payment, company currencies are all the same,
        #         #  - the payment currency is the company currency, but the invoice currency is different,
        #         #  - the invoice currency is the company currency, but the payment currency is different,
        #         #  - the invoice, payment and company currencies are all different.
        #         # For the two first cases, we can simply use the debit/credit of the invoice move line, which are always in the company currency,
        #         # and this is what the target need.
        #         # For the two last cases, we can use the debit/credit which are in the company currency, and then change them to the target currency
        #         total_amount = abs(debit - credit)
        #         actual_debit = debit > 0 and amount or 0.0
        #         actual_credit = credit > 0 and -amount or 0.0
        #         currency = company_currency
        #     if line_currency != target_currency:
        #         amount_currency_str = formatLang(self.env, abs(actual_debit or actual_credit), currency_obj=line_currency)
        #         total_amount_currency_str = formatLang(self.env, total_amount, currency_obj=line_currency)
        #     if currency != target_currency:
        #         ctx = context.copy()
        #         ctx.update({'date': target_date or line.date})
        #         total_amount = currency.with_context(ctx).compute(total_amount, target_currency)
        #         actual_debit = currency.with_context(ctx).compute(actual_debit, target_currency)
        #         actual_credit = currency.with_context(ctx).compute(actual_credit, target_currency)
        #     amount_str = formatLang(self.env, abs(actual_debit or actual_credit), currency_obj=target_currency)
        #     total_amount_str = formatLang(self.env, total_amount, currency_obj=target_currency)

        #     ret_line['debit'] = abs(actual_debit)
        #     ret_line['credit'] = abs(actual_credit)
        #     ret_line['amount_str'] = amount_str
        #     ret_line['total_amount_str'] = total_amount_str
        #     ret_line['amount_currency_str'] = amount_currency_str
        #     ret_line['total_amount_currency_str'] = total_amount_currency_str
        #     ret.append(ret_line)
        # return ret


#     @api.multi
#     @api.depends('ref', 'move_id')
#     def name_get(self):
#         result = []
#         for line in self:
#             # we get move name
#             move_name = line.move_id.display_name
#             # move_name = line.move_id.get_move_name()
#             # if move.document_number and move.document_type_id:
#             #     name = (
#             #         move.document_type_id.doc_code_prefix or '') + \
#             #         move.document_number
#             # else:
#             #     name = move.name
#             if line.ref:
#                 result.append(
#                     (line.id, (move_name or '') + '(' + line.ref + ')'))
#             else:
#                 result.append(
#                     (line.id, move_name))
#         return result
