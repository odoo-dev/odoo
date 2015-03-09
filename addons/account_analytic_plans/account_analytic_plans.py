# -*- coding: utf-8 -*-

import time
from lxml import etree

from openerp import api, fields, models, tools, _
from openerp.exceptions import UserError


class One2manyMod2(fields.One2many):

    @api.multi
    def get(self, obj, name, user=None, offset=0, values=None):
        res = {}
        for id in self.ids:
            res[id] = []
        ids2 = None
        if self.env.context.get('journal_id'):
            journal = obj.env['account.journal'].browse(self.env.context['journal_id'])
            pnum = int(name[7]) - 1
            plan = journal.plan_id
            if plan and len(plan.plan_ids) > pnum:
                acc_id = plan.plan_ids[pnum].root_analytic_id.id
                ids2 = obj.env[self._obj].search([(self._fields_id, 'in', self.ids), ('analytic_account_id', 'child_of', [acc_id])], limit=self._limit)
        if ids2 is None:
            ids2 = obj.env[self._obj].search([(self._fields_id, 'in', self.ids)], limit=self._limit)

        for r in obj.env[self._obj].read(ids2, [self._fields_id], load='_classic_write'):
            key = r[self._fields_id]
            if isinstance(key, tuple):
                # Read return a tuple in the case where the field is a many2one
                # but we want to get the id of this field.
                key = key[0]

            res[key].append(r['id'])
        return res


class AccountAnalyticLine(models.Model):
    _inherit = 'account.analytic.line'
    _description = 'Analytic Line'

    @api.multi
    def _get_amount(self):
        for line in self:
            line.amount_currency = line.move_id and line.move_id.amount_currency * (line.percentage / 100) or 0.0

    amount_currency = fields.Float(compute='_get_amount', store=True, readonly=True, help="The amount expressed in the related account currency if not equal to the company one.")
    percentage = fields.Float()


class AccountAnalyticPlan(models.Model):
    _name = "account.analytic.plan"
    _description = "Analytic Plan"

    name = fields.Char('Analytic Plan', required=True, index=True)
    plan_ids = fields.One2many('account.analytic.plan.line', 'plan_id', string='Analytic Plans', copy=True)


class AccountAnalyticPlanLine(models.Model):
    _name = "account.analytic.plan.line"
    _description = "Analytic Plan Line"
    _order = "sequence, id"

    plan_id = fields.Many2one('account.analytic.plan', string='Analytic Plan', required=True)
    name = fields.Char('Axis Name', required=True, index=True)
    sequence = fields.Integer()
    root_analytic_id = fields.Many2one('account.analytic.account', string='Root Account', help="Root account of this plan.")
    min_required = fields.Float('Minimum Allowed (%)', default=100.0)
    max_required = fields.Float('Maximum Allowed (%)', default=100.0)


class AccountAnalyticPlanInstance(models.Model):
    _name = "account.analytic.plan.instance"
    _description = "Analytic Plan Instance"

    @api.model
    def _default_journal(self):
        AccountJournal = self.env['account.journal']
        if self.env.context.get('journal_id'):
            journal = AccountJournal.browse(self.env.context['journal_id'])
            if journal.analytic_journal_id:
                return journal.analytic_journal_id
        return False

    name = fields.Char('Analytic Distribution')
    code = fields.Char('Distribution Code')
    journal_id = fields.Many2one('account.analytic.journal', string='Analytic Journal', default=_default_journal)
    account_ids = fields.One2many('account.analytic.plan.instance.line', 'plan_id', string='Account Id', copy=True)
    account1_ids = One2manyMod2('account.analytic.plan.instance.line', 'plan_id', string='Account1 Id')
    account2_ids = One2manyMod2('account.analytic.plan.instance.line', 'plan_id', string='Account2 Id')
    account3_ids = One2manyMod2('account.analytic.plan.instance.line', 'plan_id', string='Account3 Id')
    account4_ids = One2manyMod2('account.analytic.plan.instance.line', 'plan_id', string='Account4 Id')
    account5_ids = One2manyMod2('account.analytic.plan.instance.line', 'plan_id', string='Account5 Id')
    account6_ids = One2manyMod2('account.analytic.plan.instance.line', 'plan_id', string='Account6 Id')
    plan_id = fields.Many2one('account.analytic.plan', string="Model's Plan", default=False)

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        AccountJournal = self.env['account.journal']
        if self.env.context.get('journal_id'):
            journal = AccountJournal.browse(self.env.context['journal_id'])
            analytic_journal = journal.analytic_journal_id and journal.analytic_journal_id.id or False
            args.append('|')
            args.append(('journal_id', '=', analytic_journal))
            args.append(('journal_id', '=', False))
        result = super(AccountAnalyticPlanInstance, self).search(
            args, offset=offset, limit=limit, order=order, count=count)
        return result

    @api.multi
    def name_get(self):
        return self.mapped(lambda record: (record.id, '/'.join(filter(None, (record.name, record.code)))))

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        args = args or []
        if name:
            plans = self.search([('code', '=', name)] + args, limit=limit)
            if not plans:
                plans = self.search([('name', operator, name)] + args, limit=limit)
        else:
            plans = self.search(args, limit=limit)
        return plans.name_get()

    @api.model
    def fields_view_get(self, view_id=None, view_type='form', toolbar=False, submenu=False):
        wiz_id = self.env['ir.actions.act_window'].search([("name", "=", "analytic.plan.create.model.action")])
        result = super(AccountAnalyticPlanInstance, self).fields_view_get(view_id, view_type, toolbar=toolbar, submenu=submenu)
        AccountJournal = self.env['account.journal']
        AnalyticPlan = self.env['account.analytic.plan']
        if (result['type'] == 'form'):
            plan_id = False
            if self.env.context.get('journal_id'):
                plan_id = AccountJournal.browse(int(self.env.context['journal_id'])).plan_id
            elif self.env.context.get('plan_id'):
                plan_id = AnalyticPlan.browse(int(self.env.context['plan_id']))

            if plan_id:
                i = 1
                result['arch'] = """<form string="%s">
    <field name="name"/>
    <field name="code"/>
    <field name="journal_id"/>
    <button name="%d" string="Save This Distribution as a Model" type="action" colspan="2"/>
    """ % (tools.to_xml(plan_id.name), wiz_id[0])
                for line in plan_id.plan_ids:
                    result['arch'] += """
                    <field name="account%d_ids" string="%s" nolabel="1" colspan="4">
                    <tree string="%s" editable="bottom">
                        <field name="rate"/>
                        <field name="analytic_account_id" domain="[('parent_id','child_of',[%d])]" groups="analytic.group_analytic_accounting"/>
                    </tree>
                </field>
                <newline/>""" % (i, tools.to_xml(line.name), tools.to_xml(line.name), line.root_analytic_id and line.root_analytic_id.id or 0)
                    i += 1
                result['arch'] += "</form>"
                doc = etree.fromstring(result['arch'].encode('utf8'))
                xarch, xfields = self._view_look_dom_arch(doc, view_id)
                result['arch'] = xarch
                result['fields'] = xfields
            return result
        else:
            return result

    @api.model
    def create(self, vals):
        AccountJournal = self.env['account.journal']
        PlanInstance = self.env['account.analytic.plan.instance']
        AnalyticAccount = self.env['account.analytic.account']
        PlanLine = self.env['account.analytic.plan.line']
        if self.env.context.get('journal_id'):
            journal = AccountJournal.browse(self.env.context['journal_id'])

            pids = PlanInstance.search([('name', '=', vals['name']), ('code', '=', vals['code']), ('plan_id', '<>', False)])
            if pids:
                raise UserError(_('A model with this name and code already exists.'))

            result = PlanLine.search([('plan_id', '=', journal.plan_id.id)])
            for line in result:
                total_per_plan = 0
                temp_list = ['account1_ids', 'account2_ids', 'account3_ids', 'account4_ids', 'account5_ids', 'account6_ids']
                for l in temp_list:
                    if l in vals:
                        for tempo in vals[l]:
                            if AnalyticAccount.search([('parent_id', 'child_of', [line.root_analytic_id.id]), ('id', '=', tempo[2]['analytic_account_id'])]):
                                total_per_plan += tempo[2]['rate']
                if total_per_plan < line.min_required or total_per_plan > line.max_required:
                    raise UserError(_('The total should be between %s and %s.') % (str(line.min_required), str(line.max_required)))

        return super(AccountAnalyticPlanInstance, self).create(vals)

    @api.multi
    def write(self, vals):
        this = self[0]
        Invoiceline = self.env['account.invoice.line']
        if this.plan_id and not 'plan_id' in vals:
            # this instance is a model, so we have to create a new plan instance instead of modifying it
            # copy the existing model
            temp_id = this.copy(None)
            # get the list of the invoice line that were linked to the model
            lists = Invoiceline.search([('analytics_id', '=', this.id)])
            # make them link to the copy
            lists.write({'analytics_id': temp_id.id})

            # and finally modify the old model to be not a model anymore
            vals['plan_id'] = False
            if not 'name' in vals:
                vals['name'] = this.name and (str(this.name) + '*') or "*"
            if not 'code' in vals:
                vals['code'] = this.code and (str(this.code) + '*') or "*"
        return super(AccountAnalyticPlanInstance, self).write(vals)


class AccountAnalyticPlanInstanceLine(models.Model):
    _name = "account.analytic.plan.instance.line"
    _description = "Analytic Instance Line"
    _rec_name = "analytic_account_id"

    plan_id = fields.Many2one('account.analytic.plan.instance', string='Plan Id')
    analytic_account_id = fields.Many2one('account.analytic.account', string='Analytic Account', required=True, domain=[('type', '<>', 'view')])
    rate = fields.Float('Rate (%)', required=True, default=100.0)

    @api.multi
    def name_get(self):
        results = []
        for record in self:
            results.append((record.id, record.analytic_account_id))
        return results


class AccountJournal(models.Model):
    _inherit = "account.journal"
    _name = "account.journal"

    plan_id = fields.Many2one('account.analytic.plan', string='Analytic Plans')


class AccountInvoiceLine(models.Model):
    _inherit = "account.invoice.line"
    _name = "account.invoice.line"

    analytics_id = fields.Many2one('account.analytic.plan.instance', string='Analytic Distribution')

    @api.model
    def create(self, vals):
        if 'analytics_id' in vals and isinstance(vals['analytics_id'], tuple):
            vals['analytics_id'] = vals['analytics_id'][0]
        return super(AccountInvoiceLine, self).create(vals)

    @api.model
    def move_line_get_item(self, line):
        result = super(AccountInvoiceLine, self).move_line_get_item(line)
        result['analytics_id'] = line.analytics_id and line.analytics_id.id or False
        return result

    @api.multi
    def product_id_change(self, product, uom_id, qty=0, name='', type='out_invoice', partner_id=False, fposition_id=False, price_unit=False, currency_id=False, company_id=None):
        res_prod = super(AccountInvoiceLine, self).product_id_change(product, uom_id, qty, name, type, partner_id, fposition_id, price_unit, currency_id, company_id=company_id)
        analytic_default = self.env['account.analytic.default'].account_get(product, partner_id, self.env.user.id, time.strftime('%Y-%m-%d'))
        if analytic_default and analytic_default.analytics_id:
            res_prod['value']['analytics_id'] = analytic_default.analytics_id.id
        return res_prod


class AccountMoveLine(models.Model):

    _inherit = "account.move.line"
    _name = "account.move.line"

    analytics_id = fields.Many2one('account.analytic.plan.instance', string='Analytic Distribution')

    @api.model
    def _default_get_move_form_hook(self, cursor, user, data):
        data = super(AccountMoveLine, self)._default_get_move_form_hook(cursor, user, data)
        if data.get('analytics_id'):
            del(data['analytics_id'])
        return data

    @api.multi
    def create_analytic_lines(self):
        super(AccountMoveLine, self).create_analytic_lines()
        AnalyticLine = self.env['account.analytic.line']
        for line in self:
            if line.analytics_id:
                if not line.journal_id.analytic_journal_id:
                    raise UserError(_("You have to define an analytic journal on the '%s' journal.") % (line.journal_id.name,))

                toremove = AnalyticLine.search([('move_id', '=', line.id)])
                if toremove:
                    toremove.unlink()
                for line2 in line.analytics_id.account_ids:
                    val = (line.credit or 0.0) - (line.debit or 0.0)
                    amt = val * (line2.rate / 100)
                    al_vals = {
                        'name': line.name,
                        'date': line.date,
                        'account_id': line2.analytic_account_id.id,
                        'unit_amount': line.quantity,
                        'product_id': line.product_id and line.product_id.id or False,
                        'product_uom_id': line.product_uom_id and line.product_uom_id.id or False,
                        'amount': amt,
                        'general_account_id': line.account_id.id,
                        'move_id': line.id,
                        'journal_id': line.journal_id.analytic_journal_id.id,
                        'ref': line.ref,
                        'percentage': line2.rate
                    }
                    AnalyticLine.create(al_vals)
        return True


class AccountInvoice(models.Model):
    _name = "account.invoice"
    _inherit = "account.invoice"

    @api.model
    def line_get_convert(self, line, part):
        result = super(AccountInvoice, self).line_get_convert(line, part)
        result['analytics_id'] = line.get('analytics_id', False)
        return result

    @api.multi
    def _get_analytic_lines(self):
        inv = self[0]
        PlanInstance = self.env['account.analytic.plan.instance']
        company_currency = inv.company_id.currency_id.id
        if inv.type in ('out_invoice', 'in_refund'):
            sign = 1
        else:
            sign = -1

        iml = inv.move_line_get()

        for il in iml:
            if il.get('analytics_id', False):

                if inv.type in ('in_invoice', 'in_refund'):
                    ref = inv.reference
                else:
                    ref = inv.number
                obj_move_line = PlanInstance.browse(il['analytics_id'])
                amount_calc = inv.currency_id.with_context(date=inv.date_invoice).compute(company_currency, il['price']) * sign
                qty = il['quantity']
                il['analytic_lines'] = []
                for line2 in obj_move_line.account_ids:
                    amt = amount_calc * (line2.rate / 100)
                    qtty = qty * (line2.rate / 100)
                    al_vals = {
                        'name': il['name'],
                        'date': inv['date_invoice'],
                        'unit_amount': qtty,
                        'product_id': il['product_id'],
                        'account_id': line2.analytic_account_id.id,
                        'amount': amt,
                        'product_uom_id': il['uos_id'],
                        'general_account_id': il['account_id'],
                        'journal_id': self._get_journal_analytic(inv.type),
                        'ref': ref,
                    }
                    il['analytic_lines'].append((0, 0, al_vals))
        return iml


class AccountAnalyticPlan(models.Model):
    _inherit = "account.analytic.plan"

    default_instance_id = fields.Many2one('account.analytic.plan.instance', string='Default Entries')


class AnalyticDefault(models.Model):
    _inherit = "account.analytic.default"

    analytics_id = fields.Many2one('account.analytic.plan.instance', string='Analytic Distribution')


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"

    # Method overridden to set the analytic account by default on criterion match
    @api.multi
    def invoice_line_create(self):
        create_ids = super(SaleOrderLine, self).invoice_line_create()
        InvoiceLine = self.env['account.invoice.line']
        AccountAnalyticDefault = self.env['account.analytic.default']
        if self:
            sale_line = self
            for line in InvoiceLine.browse(create_ids):
                record = AccountAnalyticDefault.account_get(
                    line.product_id.id,
                    sale_line.order_id.partner_id.id, self.env.user.id, fields.Date.today(),
                    sale_line.order_id.company_id.id)

                if record:
                    line.write({'analytics_id': record.analytics_id.id})
        return create_ids


class AccountBankStatement(models.Model):
    _inherit = "account.bank.statement"
    _name = "account.bank.statement"

    @api.multi
    def button_confirm_bank(self):
        super(AccountBankStatement, self).button_confirm_bank()
        for bank_statement in self:
            for st_line in bank_statement.line_ids:
                if st_line.analytics_id:
                    if not bank_statement.journal_id.analytic_journal_id:
                        raise UserError(_("You have to define an analytic journal on the '%s' journal.") % (bank_statement.journal_id.name,))
                if not st_line.amount:
                    continue
        return True


class AccountBankStatementLine(models.Model):
    _inherit = "account.bank.statement.line"
    _name = "account.bank.statement.line"

    analytics_id = fields.Many2one('account.analytic.plan.instance', string='Analytic Distribution')

    @api.model
    def _prepare_move_line(self, move, amount):
        result = super(AccountBankStatementLine, self)._prepare_bank_move_line(move, amount)
        result['analytics_id'] = self.analytics_id.id
        return result
