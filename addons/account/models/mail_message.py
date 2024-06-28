# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup

from odoo import api, fields, models, _
from odoo.exceptions import UserError
from odoo.osv.expression import OR

DOMAINS = {
    'account.move': lambda operator, value: [('company_id.check_account_audit_trail', operator, value)],
    'account.account': lambda operator, value: [('company_id.check_account_audit_trail', operator, value)],
    'account.tax': lambda operator, value: [('company_id.check_account_audit_trail', operator, value)],
    'res.partner': lambda operator, value: [
        '|', ('company_id', '=', False), ('company_id.check_account_audit_trail', operator, value),
        '|', ('customer_rank', '>', 0), ('supplier_rank', '>', 0),
    ],
    'res.company': lambda operator, value: [('check_account_audit_trail', operator, value)],
}


class Message(models.Model):
    _inherit = 'mail.message'

    account_audit_log_preview = fields.Html(string="Description", compute="_compute_account_audit_log_preview")
    account_audit_log_move_id = fields.Many2one(
        comodel_name='account.move',
        string="Journal Entry",
        compute="_compute_account_audit_log_move_id",
        search="_search_account_audit_log_move_id",
    )
    account_audit_log_partner_id = fields.Many2one(
        comodel_name='res.partner',
        string="Partner",
        compute="_compute_account_audit_log_partner_id",
        search="_search_account_audit_log_partner_id",
    )
    account_audit_log_account_id = fields.Many2one(
        comodel_name='account.account',
        string="Account",
        compute="_compute_account_audit_log_account_id",
        search="_search_account_audit_log_account_id",
    )
    account_audit_log_tax_id = fields.Many2one(
        comodel_name='account.tax',
        string="Tax",
        compute="_compute_account_audit_log_tax_id",
        search="_search_account_audit_log_tax_id",
    )
    account_audit_log_company_id = fields.Many2one(
        comodel_name='res.company',
        string="Company ",
        compute="_compute_account_audit_log_company_id",
        search="_search_account_audit_log_company_id",
    )
    account_audit_log_activated = fields.Boolean(
        string="Audit Log Activated",
        compute="_compute_account_audit_log_activated",
        search="_search_account_audit_log_activated",
    )

    @api.depends('tracking_value_ids')
    def _compute_account_audit_log_preview(self):
        move_messages = self.filtered(lambda m: m.model == 'account.move' and m.res_id)
        (self - move_messages).account_audit_log_preview = False
        for message in move_messages:
            title = message.subject or message.preview
            tracking_value_ids = message.sudo().tracking_value_ids._filter_has_field_access(self.env)
            if not title and tracking_value_ids:
                title = _("Updated")
            if not title and message.subtype_id and not message.subtype_id.internal:
                title = message.subtype_id.display_name
            audit_log_preview = Markup("<div>%s</div>") % (title or '')
            audit_log_preview += Markup("<br>").join(
                Markup(
                    "%(old_value)s <i class='o_TrackingValue_separator fa fa-long-arrow-right mx-1 text-600' title='%(title)s' role='img' aria-label='%(title)s'></i>%(new_value)s (%(field)s)"
                ) % {
                    'old_value': fmt_vals['oldValue']['value'],
                    'new_value': fmt_vals['newValue']['value'],
                    'title': _("Changed"),
                    'field': fmt_vals['changedField'],
                }
                for fmt_vals in tracking_value_ids._tracking_value_format()
            )
            message.account_audit_log_preview = audit_log_preview

    def _compute_account_audit_log_move_id(self):
        self._compute_audit_log_related_record_id('account.move', 'account_audit_log_move_id')

    def _search_account_audit_log_move_id(self, operator, value):
        return self._search_audit_log_related_record_id('account.move', operator, value)

    def _compute_account_audit_log_account_id(self):
        self._compute_audit_log_related_record_id('account.account', 'account_audit_log_account_id')

    def _search_account_audit_log_account_id(self, operator, value):
        return self._search_audit_log_related_record_id('account.account', operator, value)

    def _compute_account_audit_log_tax_id(self):
        self._compute_audit_log_related_record_id('account.tax', 'account_audit_log_tax_id')

    def _search_account_audit_log_tax_id(self, operator, value):
        return self._search_audit_log_related_record_id('account.tax', operator, value)

    def _compute_account_audit_log_company_id(self):
        self._compute_audit_log_related_record_id('res.company', 'account_audit_log_company_id')

    def _search_account_audit_log_company_id(self, operator, value):
        return self._search_audit_log_related_record_id('res.company', operator, value)

    def _compute_account_audit_log_partner_id(self):
        self._compute_audit_log_related_record_id('res.partner', 'account_audit_log_partner_id')

    def _search_account_audit_log_partner_id(self, operator, value):
        return self._search_audit_log_related_record_id('res.partner', operator, value)

    def _compute_account_audit_log_activated(self):
        for message in self:
            message.account_audit_log_activated = message.message_type == 'notification' and (
                message.account_audit_log_move_id
                or message.account_audit_log_account_id
                or message.account_audit_log_tax_id
                or message.account_audit_log_partner_id
                or message.account_audit_log_company_id
            )

    def _search_account_audit_log_activated(self, operator, value):
        if operator not in ['=', '!='] or not isinstance(value, bool):
            raise UserError(_('Operation not supported'))
        return [('message_type', '=', 'notification')] + OR([
            [('model', '=', model), ('res_id', 'in', self.env[model]._search(DOMAINS[model](operator, value)))]
            for model in DOMAINS
        ])

    def _compute_audit_log_related_record_id(self, model, fname):
        messages_of_related = self.filtered(lambda m: m.model == model and m.res_id)
        (self - messages_of_related)[fname] = False
        if messages_of_related:
            domain = DOMAINS[model](operator='=', value=True)
            related_recs = self.env[model].sudo().search([('id', 'in', messages_of_related.mapped('res_id'))] + domain)
            recs_by_id = {record.id: record for record in related_recs}
            for message in messages_of_related:
                message[fname] = recs_by_id.get(message.res_id, False)

    def _search_audit_log_related_record_id(self, model, operator, value):
        if operator in ['=', 'like', 'ilike', '!=', 'not ilike', 'not like'] and isinstance(value, str):
            res_id_domain = [('res_id', 'in', self.env[model]._name_search(value, operator=operator))]
        elif operator in ['=', 'in', '!=', 'not in']:
            res_id_domain = [('res_id', operator, value)]
        else:
            raise UserError(_('Operation not supported'))
        return [('model', '=', model)] + res_id_domain

    @api.ondelete(at_uninstall=True)
    def _except_audit_log(self):
        for message in self:
            if message.account_audit_log_activated and not (
                message.account_audit_log_move_id
                and not message.account_audit_log_move_id.posted_before
            ):
                raise UserError(_("You cannot remove parts of the audit trail. Archive the record instead."))

    def write(self, vals):
        if vals.keys() & {'res_id', 'res_model', 'subject', 'message_type', 'subtype_id'}:
            self._except_audit_log()
        return super().write(vals)
