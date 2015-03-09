# -*- coding: utf-8 -*-

from openerp import api, fields, models
from lxml import etree
from openerp.tools.translate import _
from openerp.exceptions import UserError, ValidationError

class Followup(models.Model):
    _name = 'account_followup.followup'
    _description = 'Account Follow-up'
    _rec_name = 'name'

    followup_line = fields.One2many('account_followup.followup.line', 'followup_id', 'Follow-up', copy=True)
    company_id = fields.Many2one('res.company', 'Company', default=lambda self: self.env['res.company']._company_default_get('account_followup.followup'), required=True)
    name = fields.Char(related='company_id.name', readonly=True)

    _sql_constraints = [('company_uniq', 'unique(company_id)', 'Only one follow-up per company is allowed')]


class FollowupLine(models.Model):

    def _get_default_template(self):
        try:
            return self.env.ref('account_followup.email_template_account_followup_default')
        except ValueError:
            return False

    def _get_default_description(self):
        description = """Dear % (partner_name)s ,
            Exception made if there was a mistake of ours, it seems that the following amount stays unpaid.
            Please, take appropriate measures in order to carry out this payment in the next 8 days.
            Would your payment have been carried out after this mail was sent, please ignore this message
            Do not hesitate to contact our accounting department.
            Best Regards""",
        return description

    _name = 'account_followup.followup.line'
    _description = 'Follow-up Criteria'

    name = fields.Char('Follow-Up Action', required=True)
    sequence = fields.Integer(help="Gives the sequence order when displaying a list of follow-up lines.")
    delay = fields.Integer('Due Days', help="The number of days after the due date of the invoice to wait before sending the reminder.      Could be negative if you want to send a polite alert beforehand.", required=True)
    followup_id = fields.Many2one('account_followup.followup', 'Follow Ups', required=True, ondelete="cascade")
    description = fields.Text('Printed Message', default=_get_default_description, translate=True)
    send_email = fields.Boolean('Send an Email', default=True, help="When processing, it will send an email")
    send_letter = fields.Boolean('Send a Letter', default=True, help="When processing, it will print a letter")
    manual_action = fields.Boolean(default=False, help="When processing, it will set the manual action to be taken for that customer. ")
    manual_action_note = fields.Text('Action To Do', placeholder="e.g. Give a phone call, check with others , ...")
    manual_action_responsible_id = fields.Many2one('res.users', 'Assign a Responsible', ondelete='set null')
    email_template_id = fields.Many2one('mail.template', 'Email Template', default=_get_default_template, ondelete='set null')

    _order = 'delay'
    _sql_constraints = [('days_uniq', 'unique(followup_id, delay)', 'Days of the follow-up levels must be different')]

    @api.one
    @api.constrains('partner_name', 'date', 'user_signature', 'company_name')
    def _check_description(self):
        for line in self:
            if line.description:
                try:
                    line.description % {'partner_name': '', 'date': '', 'user_signature': '', 'company_name': ''}
                except:
                    return False
        raise ValidationError(_('Your description is invalid, use the right legend or %% if you want to use the percent character.'))


class AccountMoveLine(models.Model):

    @api.multi
    @api.depends('debit', 'credit')
    def _get_result(self):
        for aml in self:
            aml.result = aml.debit - aml.credit
        return aml.result

    _inherit = 'account.move.line'
    followup_line_id = fields.Many2one('account_followup.followup.line', 'Follow-up Level', ondelete='restrict') # restrict deletion of the followup line
    followup_date = fields.Date('Latest Follow-up', index=True)
    result = fields.Float(compute='_get_result', string="Balance") # 'balance' field is not the same

class Partner(models.Model):

    @api.model
    def fields_view_get(self, view_id=None, view_type=None, toolbar=False, submenu=False):
        context = self.env.context or {}
        res = super(Partner, self).fields_view_get(view_id=view_id, view_type=view_type, toolbar=toolbar, submenu=submenu)
        if view_type == 'form' and context.get('Followupfirst'):
            doc = etree.XML(res['arch'], parser=None, base_url=None)
            first_node = doc.xpath("//page[@name='followup_tab']")
            root = first_node[0].getparent()
            root.insert(0, first_node[0])
            res['arch'] = etree.tostring(doc, encoding="utf-8")
        return res

    @api.multi
    @api.depends('unreconciled_aml_ids', 'unreconciled_aml_ids.reconciled', 'unreconciled_aml_ids.followup_line_id')
    def _get_latest(self):
        company = self.env.user.company_id or self.company_id
        for partner in self:
            amls = partner.unreconciled_aml_ids
            latest_date = False
            latest_level = False
            latest_days = False
            latest_level_without_lit = False
            latest_days_without_lit = False
            for aml in amls:
                if (aml.company_id == company) and (aml.followup_line_id is not False) and (not latest_days or latest_days < aml.followup_line_id.delay):
                    latest_days = aml.followup_line_id.delay
                    latest_level = aml.followup_line_id.id
                if (aml.company_id == company) and (not latest_date or latest_date < aml.followup_date):
                    latest_date = aml.followup_date
                if (aml.company_id == company) and (aml.blocked is False) and (aml.followup_line_id is not False and
                            (not latest_days_without_lit or latest_days_without_lit < aml.followup_line_id.delay)):
                    latest_days_without_lit = aml.followup_line_id.delay
                    latest_level_without_lit = aml.followup_line_id.id
            partner.latest_followup_date = latest_date
            partner.latest_followup_level_id = latest_level
            partner.latest_followup_level_id_without_lit = latest_level_without_lit

    def do_partner_manual_action(self):
        #partner_ids -> res.partner
        for partner in self.partner_ids:
            #Check action: check if the action was not empty, if not add
            action_text = ""
            if partner.payment_next_action:
                action_text = (partner.payment_next_action or '') + "\n" + (partner.latest_followup_level_id_without_lit.manual_action_note or '')
            else:
                action_text = partner.latest_followup_level_id_without_lit.manual_action_note or ''

            #Check date: only change when it did not exist already
            action_date = partner.payment_next_action_date or fields.date.context_today(self)

            # Check responsible: if partner has not got a responsible already, take from follow-up
            responsible_id = False
            if partner.payment_responsible_id:
                responsible_id = partner.payment_responsible_id.id
            else:
                p = partner.latest_followup_level_id_without_lit.manual_action_responsible_id
                responsible_id = p and p.id or False
            self.write({'payment_next_action_date': action_date,
                        'payment_next_action': action_text,
                        'payment_responsible_id': responsible_id})

    @api.one
    def do_partner_print(self, wizard_partner_ids, data):
        #wizard_partner_ids are ids from special view, not from res.partner
        if not wizard_partner_ids:
            return {}
        data['partner_ids'] = wizard_partner_ids
        datas = {'ids': wizard_partner_ids,
                 'model': 'account_followup.followup',
                 'form': data}
        return self.env['report'].get_action(self, 'account_followup.report_followup', data=datas)

    @api.multi
    def do_partner_mail(self):
        #partner_ids are res.partner ids
        # If not defined by latest follow-up level, it will be the default template if it can find it
        unknown_mails = 0
        for partner in self:
            if partner.email and partner.email.strip():
                level = partner.latest_followup_level_id_without_lit
                if level and level.send_email and level.email_template_id and level.email_template_id.id:
                    level.email_template_id.send_mail(partner.id)
                else:
                    mail_template_id = self.env.ref('account_followup.email_template_account_followup_default')
                    mail_template_id.send_mail(partner.id)
            else:
                unknown_mails = unknown_mails + 1
                action_text = _("Email not sent because of email address of partner not filled in")
                if partner.payment_next_action_date:
                    payment_action_date = min(fields.Date.context_today(self), partner.payment_next_action_date)
                else:
                    payment_action_date = fields.Date.context_today(self)
                if partner.payment_next_action:
                    payment_next_action = partner.payment_next_action + " \n " + action_text
                else:
                    payment_next_action = action_text
                self.write({'payment_next_action_date': payment_action_date,
                            'payment_next_action': payment_next_action})
        return unknown_mails

    def get_followup_table_html(self):
        """ Build the html tables to be included in emails send to partners,
            when reminding them their overdue invoices.
            :param ids: [id] of the partner for whom we are building the tables
            :rtype: string
        """

        self.ensure_one()
        #copy the context to not change global context. Overwrite it because _() looks for the lang in local variable 'context'.
        #Set the language to use = the partner language
        followup_table = ''
        if self.unreconciled_aml_ids:
            company = self.env.user.company_id
            current_date = fields.Date.context_today(self)
            ReportFollowup = self.env['report.account_followup.report_followup']
            Followup_line = ReportFollowup._lines_get_with_partner(self, self.company_id)

            for currency_dict in Followup_line:
                currency = currency_dict.get('line', [{'currency_id': company.currency_id}])[0]['currency_id']
                followup_table += '''
                <table border="2" width=100%%>
                <tr>
                    <td>''' + _("Invoice Date") + '''</td>
                    <td>''' + _("Description") + '''</td>
                    <td>''' + _("Reference") + '''</td>
                    <td>''' + _("Due Date") + '''</td>
                    <td>''' + _("Amount") + " (%s)" % (currency.symbol) + '''</td>
                    <td>''' + _("Lit.") + '''</td>
                </tr>
                '''
                total = 0
                for aml in currency_dict['line']:
                    block = aml['blocked'] and 'X' or ' '
                    total += aml['balance']
                    strbegin = "<TD>"
                    strend = "</TD>"
                    date = aml['date_maturity'] or aml['date']
                    if date <= current_date and aml['balance'] > 0:
                        strbegin = "<TD><B>"
                        strend = "</B></TD>"
                    followup_table += "<TR>" + strbegin + str(aml['date']) + strend + strbegin + aml['name'] + strend + strbegin + (aml['ref'] or '') + strend + strbegin + str(date) + strend + strbegin + str(aml['balance']) + strend + strbegin + block + strend + "</TR>"

                total = reduce(lambda x, y: x+y['balance'], currency_dict['line'], 0.00)

                followup_table += '''<tr> </tr>
                                </table>
                                <center>''' + _("Amount due") + ''' : %s </center>''' % (total)
        return followup_table

    @api.multi
    def write(self, vals):
        if vals.get("payment_responsible_id", False):
            for part in self:
                if part.payment_responsible_id != vals["payment_responsible_id"]:
                    #Find partner_id of user put as responsible
                    responsible_partner_id = self.env["res.users"].browse(vals['payment_responsible_id']).partner_id.id
                    part.message_post(body=_("You became responsible to do the next action for the payment follow-up of") + " <b><a href='#id=" + str(part.id) + "&view_type=form&model=res.partner'> " + part.name + " </a></b>",
                                      type='comment',
                                      subtype="mail.mt_comment",
                                      model='res.partner', res_id=part.id,
                                      partner_ids=[responsible_partner_id])
        return super(Partner, self).write(vals)

    @api.multi
    def action_done(self):
        return self.write({'payment_next_action_date': False, 'payment_next_action': '', 'payment_responsible_id': False})

    @api.multi
    def do_button_print(self):
        self.ensure_one()
        company_id = self.env.user.company_id.id
        #search if the partner has accounting entries to print. If not, it may not be present in the
        #psql view the report is based on, so we need to stop the user here.
        if not self.env['account.move.line'].search_count([('partner_id', '=', self.id),
                                                           ('account_id.internal_type', '=', 'receivable'),
                                                           ('reconciled', '=', False),
                                                           ('company_id', '=', company_id)]):
            raise UserError(_("The partner does not have any accounting entries to print in the overdue report for the current company."))
        self.message_post(body=_('Printed overdue payments report'))
        #build the id of this partner in the psql view. Could be replaced by a search with [('company_id', '=', company_id),('partner_id', '=', ids[0])]
        wizard_partner_ids = [self.id * 10000 + company_id]
        followup_ids = self.env['account_followup.followup'].search([('company_id', '=', company_id)], limit=1)
        if not followup_ids:
            raise UserError(_("There is no followup plan defined for the current company."))
        data = {
            'date': fields.Date.today(),
            'followup_id': followup_ids,
        }
        #call the print overdue report on this partner
        return self.do_partner_print(wizard_partner_ids, data)

    @api.multi
    @api.depends('unreconciled_aml_ids.result', 'unreconciled_aml_ids.date')
    def _get_amounts_and_date(self):
        '''
        Function that computes values for the followup functional fields. Note that 'payment_amount_due'
        is similar to 'credit' field on res.partner except it filters on user's company.
        '''
        company = self.env.user.company_id
        current_date = fields.Date.context_today(self)
        for partner in self:
            worst_due_date = False
            amount_due = amount_overdue = 0.0
            for aml in partner.unreconciled_aml_ids:
                if (aml.company_id == company):
                    date_maturity = aml.date_maturity or aml.date
                    if not worst_due_date or date_maturity < worst_due_date:
                        worst_due_date = date_maturity
                    amount_due += aml.result
                    if (date_maturity <= current_date):
                        amount_overdue += aml.result
            partner.payment_amount_due = amount_due
            partner.payment_amount_overdue = amount_overdue
            partner.payment_earliest_due_date = worst_due_date

    def _get_followup_overdue_query(self, value, overdue_only=False):
        '''
        This function is used to build the query and arguments to use when making a search on functional fields
            * payment_amount_due
            * payment_amount_overdue
        Basically, the query is exactly the same except that for overdue there is an extra clause in the WHERE.

        :param args: arguments given to the search in the usual domain notation (list of tuples)
        :param overdue_only: option to add the extra argument to filter on overdue accounting entries or not
        :returns: a tuple with
            * the query to execute as first element
            * the arguments for the execution of this query
        :rtype: (string, [])
        '''
        company_id = self.env.user.company_id.id
        having_where_clause = ' AND '.join(map(lambda x: '(SUM(bal2) %s %%s)' % (x[1]), value))
        having_values = [x[2] for x in value]
        query, query_params = self.env['account.move.line']._query_get()
        overdue_only_str = overdue_only and 'AND date_maturity <= NOW()' or ''
        return ('''SELECT pid AS partner_id, SUM(bal2) FROM
                    (SELECT CASE WHEN bal IS NOT NULL THEN bal
                    ELSE 0.0 END AS bal2, p.id as pid FROM
                    (SELECT (debit-credit) AS bal, partner_id
                    FROM account_move_line l
                    WHERE account_id IN
                            (SELECT a.id FROM account_account a
                                LEFT JOIN account_account_type act ON (a.user_type=act.id)
                            WHERE act.type=\'receivable\' AND deprecated='f')
                    ''' + overdue_only_str + '''
                    AND reconciled IS FALSE
                    AND company_id = %s
                    ''' + query + ''') AS l
                    RIGHT JOIN res_partner p
                    ON p.id = partner_id ) AS pl
                    GROUP BY pid HAVING ''' + having_where_clause, [company_id] + query_params + having_values)

    def _payment_overdue_search(self, operator, value):
        if not value:
            return []
        query, query_args = self._get_followup_overdue_query(value, overdue_only=True)
        self.env.cr.execute(query, query_args)
        res = self.env.cr.fetchall()
        if not res:
            return [('id', '=', '0')]
        return [('id', 'in', [x[0] for x in res])]

    def _payment_earliest_date_search(self, operator, value):
        if not value:
            return []
        company_id = self.env.users.company_id.id
        having_where_clause = ' AND '.join(map(lambda x: '(MIN(l.date_maturity) %s %%s)' % (x[1]), value))
        having_values = [x[2] for x in value]
        query, query_params = self.env['account.move.line']._query_get()
        self.env.cr.execute('SELECT partner_id FROM account_move_line l '
                    'WHERE account_id IN '
                        '(SELECT a.id FROM account_account a'
                        'LEFT JOIN account_account_type act ON (a.user_type=act.id)'
                        'WHERE act.type=\'receivable\' AND deprecated=False) '
                    'AND l.company_id = %s '
                    'AND reconciled IS FALSE '
                    'AND '+query+' '
                    'AND partner_id IS NOT NULL '
                    'GROUP BY partner_id HAVING ' + having_where_clause,
                    [company_id] + query_params + having_values)
        res = self.env.cr.fetchall()
        if not res:
            return [('id', '=', '0')]
        return [('id', 'in', [x[0] for x in res])]

    def _payment_due_search(self, operator, value):
        if not value:
            return []
        query, query_args = self._get_followup_overdue_query(value, overdue_only=False)
        self.env.cr.execute(query, query_args)
        res = self.env.cr.fetchall()
        if not res:
            return [('id', '=', '0')]
        return [('id', 'in', [x[0] for x in res])]

    _inherit = "res.partner"

    payment_responsible_id = fields.Many2one('res.users', ondelete='set null', string='Follow-up Responsible',
                                             help="Optionally you can assign a user to this field, which will make him responsible for the action.",
                                             track_visibility="onchange", copy=False)
    payment_note = fields.Text('Customer Payment Promise', help="Payment Note", track_visibility="onchange", copy=False)
    payment_next_action = fields.Text('Next Action', copy=False,
                                help="This is the next action to be taken.  It will automatically be set when the partner gets a follow-up level that requires a manual action. ",
                                track_visibility="onchange")
    payment_next_action_date = fields.Date('Next Action Date', copy=False,
                                help="This is when the manual follow-up is needed. "
                                     "The date will be set to the current date when the partner "
                                     "gets a follow-up level that requires a manual action. "
                                     "Can be practical to set manually e.g. to see if he keeps "
                                     "his promises.")
    unreconciled_aml_ids = fields.One2many('account.move.line', 'partner_id', domain=['&', ('reconciled', '=', False), '&',
                        ('account_id.deprecated','=', False), '&', ('account_id.internal_type', '=', 'receivable')])
    latest_followup_date = fields.Date(compute='_get_latest',
                                       help="Latest date that the follow-up level of the partner was changed",
                                       store=False, multi="latest")
    latest_followup_level_id = fields.Many2one('account_followup.followup.line', compute='_get_latest', string="Latest Follow-up Level",
        help="The maximum follow-up level", store=True, multi="latest")
    latest_followup_level_id_without_lit = fields.Many2one('account_followup.followup.line', compute='_get_latest', string="Latest Follow-up Level without litigation",
        help="The maximum follow-up level without taking into account the account move lines with litigation",
        store=True, multi="latest")
    payment_amount_due = fields.Float(compute='_get_amounts_and_date',
                                      string="Amount Due", multi="followup",
                                      store=False, search='_payment_due_search')
    payment_amount_overdue = fields.Float(compute='_get_amounts_and_date',
                                          string="Amount Overdue", multi="followup",
                                          store=False, search='_payment_overdue_search')
    payment_earliest_due_date = fields.Date(compute='_get_amounts_and_date',
                                            string="Worst Due Date", multi="followup",
                                            search='_payment_earliest_date_search')


class AccountConfigSettings(models.TransientModel):
    _name = 'account.config.settings'
    _inherit = 'account.config.settings'

    def open_followup_level_form(self):
        res_ids = self.env['account_followup.followup'].search([])
        return {'type': 'ir.actions.act_window',
                'name': 'Payment Follow-ups',
                'res_model': 'account_followup.followup',
                'res_id': res_ids and res_ids[0] or False,
                'view_mode': 'form,tree', }
