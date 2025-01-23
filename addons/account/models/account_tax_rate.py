from odoo import models, fields
from odoo.exceptions import UserError
from odoo.tools import format_date


class AccountTaxRate(models.Model):
    _name = 'account.tax.rate'
    _description = 'Historical Tax Rate'
    _order = 'start_date desc'

    tax_id = fields.Many2one('account.tax', string='Tax', required=True, ondelete='cascade')
    amount = fields.Float(required=True, digits=(16, 4), default=0.0)
    start_date = fields.Date(required=True, default='1900-01-01')

    def _for_date(self, date):
        self.tax_id.ensure_one()
        eligible_rates = self.filtered_domain([('start_date', '<=', fields.Date.to_date(date))])
        if not eligible_rates:
            raise UserError(self.env._(
                "No tax rate before %(date)s defined for tax %(name)s",
                date=format_date(self.env, date),
                name=self.tax_id.display_name,
            ))
        return max(eligible_rates, key=lambda r: r.start_date)


class AccountTaxTags(models.Model):
    _name = 'account.historical.tax.tags'
    _description = 'Historical Tax Tags'
    _order = 'start_date desc'

    repartition_line_id = fields.Many2one('account.tax.repartition.line', required=True, ondelete='cascade')
    tag_ids = fields.Many2many(comodel_name='account.account.tag', domain=[('applicability', '=', 'taxes')], copy=True, ondelete='restrict')
    start_date = fields.Date(required=True, default='1900-01-01')

    def _for_date(self, date):
        self.repartition_line_id.ensure_one()
        eligible_tags = self.filtered_domain([('start_date', '<=', fields.Date.to_date(date))])
        if not eligible_tags:
            raise UserError(self.env._(
                "No tax tags before %(date)s defined for tax %(name)s",
                date=format_date(self.env, date),
                name=self.repartition_line_ids.display_name,
            ))
        return max(eligible_tags, key=lambda r: r.start_date)
