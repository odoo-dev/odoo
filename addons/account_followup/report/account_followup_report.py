# -*- coding: utf-8 -*-

from openerp import api, fields, models
from openerp import tools

class AccountFollowupStat(models.Model):
    _name = "account_followup.stat"
    _description = "Follow-up Statistics"
    _rec_name = 'partner_id'
    _auto = False
    partner_id = fields.Many2one('res.partner', 'Partner', readonly=True)
    date_move = fields.Date('First move', readonly=True)
    date_move_last = fields.Date('Last move', readonly=True)
    date_followup = fields.Date('Latest followup', readonly=True)
    followup_id = fields.Many2one('account_followup.followup.line',
                                  'Follow Ups', readonly=True, ondelete="cascade")
    balance = fields.Float(readonly=True)
    debit = fields.Float(readonly=True)
    credit = fields.Float(readonly=True)
    company_id = fields.Many2one('res.company', 'Company', readonly=True)
    blocked = fields.Boolean(readonly=True)
    date = fields.Date('Account Date', readonly=True)

    _order = 'date_move'

    @api.model
    def search(self, args, offset=0, limit=None, order=None, count=False):
        for arg in args:
            if arg[0] == 'date' and arg[2] == 'current_year':
                #current_year = self.pool.get('account.fiscalyear').find(cr, uid)
                # TODO account.period is now removed
                # ids = self.pool.get('account.fiscalyear').read(cr, uid, [current_year], ['period_ids'])[0]['period_ids']
                # args.append(['period_id','in',ids])
                args.remove(arg)
        return super(AccountFollowupStat, self).search(args=args, offset=offset, limit=limit, order=order, count=count)

    @api.model
    def read_group(self, domain, *args, **kwargs):
        for arg in domain:
            if arg[0] == 'date' and arg[2] == 'current_year':
                #current_year = self.pool.get('account.fiscalyear').find(cr, uid)
                # TODO account.period is now removed
                # ids = self.pool.get('account.fiscalyear').read(cr, uid, [current_year], ['period_ids'])[0]['period_ids']
                # domain.append(['period_id','in',ids])
                domain.remove(arg)
        return super(AccountFollowupStat, self).read_group(domain, *args, **kwargs)

    def init(self, cr):
        tools.drop_view_if_exists(cr, 'account_followup_stat')
        cr.execute("""
            create or replace view account_followup_stat as (
                SELECT
                    l.id as id,
                    l.partner_id AS partner_id,
                    min(l.date) AS date_move,
                    max(l.date) AS date_move_last,
                    max(l.followup_date) AS date_followup,
                    max(l.followup_line_id) AS followup_id,
                    sum(l.debit) AS debit,
                    sum(l.credit) AS credit,
                    sum(l.debit - l.credit) AS balance,
                    l.company_id AS company_id,
                    l.blocked as blocked,
                    l.date AS date
                FROM
                    account_move_line l
                    LEFT JOIN account_account a ON (l.account_id = a.id)
                    LEFT JOIN account_account_type act ON (a.user_type = act.id)
                WHERE
                    a.deprecated='f' AND
                    act.type = 'receivable' AND
                    l.reconciled is FALSE AND
                    l.partner_id IS NOT NULL
                GROUP BY
                    l.id, l.partner_id, l.company_id, l.blocked, l.date
            )""")
