# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models, fields, _
from odoo.exceptions import UserError


class ResCurrency(models.Model):
    _inherit = 'res.currency'

    display_rounding_warning = fields.Boolean(string="Display Rounding Warning", compute='_compute_display_rounding_warning',
        help="Technical field. Used to tell whether or not to display the rounding warning. The warning informs a rounding factor change might be dangerous on res.currency's form view.")


    @api.depends('rounding')
    def _compute_display_rounding_warning(self):
        for record in self:
            record.display_rounding_warning = record.id \
                                              and record._origin.rounding != record.rounding \
                                              and record._origin._has_accounting_entries()

    def write(self, vals):
        if 'rounding' in vals:
            rounding_val = vals['rounding']
            for record in self:
                if (rounding_val > record.rounding or rounding_val == 0) and record._has_accounting_entries():
                    raise UserError(_("You cannot reduce the number of decimal places of a currency which has already been used to make accounting entries."))

        return super(ResCurrency, self).write(vals)

    def _has_accounting_entries(self):
        """ Returns True if this currency has been used to generate (hence, round)
        some move lines (either as their foreign currency, or as the main currency
        of their company).
        """
        self.ensure_one()
        return bool(self.env['account.move.line'].search_count(['|', ('currency_id', '=', self.id), ('company_currency_id', '=', self.id)]))

    @api.model
    def _get_query_currency_table(self, options):
        ''' Construct the currency table as a mapping company -> rate to convert the amount to the user's company
        currency in a multi-company/multi-currency environment.
        The currency_table is a small postgresql table construct with VALUES.
        :param options: The report options.
        :return:        The query representing the currency table.
        '''

        user_company = self.env.company
        user_currency = user_company.currency_id
        if options.get('multi_company', False):
            companies = self.env.companies
            conversion_date = options['date']['date_to']
            currency_rates = companies.mapped('currency_id')._get_rates(user_company, conversion_date)
        else:
            companies = user_company
            currency_rates = {user_currency.id: 1.0}

        conversion_rates = []
        for company in companies:
            conversion_rates.extend((
                company.id,
                currency_rates[user_company.currency_id.id] / currency_rates[company.currency_id.id],
                user_currency.decimal_places,
            ))
        query = '(VALUES %s) AS currency_table(company_id, rate, precision)' % ','.join('(%s, %s, %s)' for i in companies)
        return self.env.cr.mogrify(query, conversion_rates).decode(self.env.cr.connection.encoding)


class CurrencyRate(models.Model):
    _inherit = "res.currency.rate"

    has_accounting_entries = fields.Boolean(compute="_compute_has_accounting_entries")

    def write(self, vals):
        if self._get_rates_with_accounting_entries():
            raise UserError(_("You cannot update a rate already used on an accounting entry."))

        return super(CurrencyRate, self).write(vals)
    
    def unlink(self):
        if self._get_rates_with_accounting_entries():
            raise UserError(_("You cannot delete a rate already used on an accounting entry."))

        return super(CurrencyRate, self).unlink()

    def create(self, vals):
        to_join = []
        values = []
        for val in vals:
            to_join.append("(%s, %s)")
            values += [val['currency_id'], fields.Date.from_string(val['name'])]
        if to_join:
            new_rates = ',\n'.join(to_join)
            query = f"""
                WITH new_rates (currency_id, name) AS ( VALUES
                    {new_rates}
                ),
                rates AS (
                    SELECT *, COALESCE((
                            SELECT name
                              FROM res_currency_rate cr
                             WHERE cr.name > new_rates.name
                               AND cr.currency_id = new_rates.currency_id
                          ORDER BY name
                             LIMIT 1
                        ), CURRENT_DATE + INTERVAL '1 day') AS following
                    FROM new_rates
                )
                SELECT rates.name
                FROM account_move_line aml
                JOIN rates ON (rates.currency_id = aml.currency_id OR rates.currency_id = aml.company_currency_id)
                                        AND aml.date >= rates.name
                                        AND aml.date < rates.following
                """
            self.env.cr.execute(query, values)
            res = self.env.cr.fetchall()
            if res:
                names = [fields.Date().to_string(x[0]) for x in res]
                raise UserError(_('You cannot create a currency rate with a date that would impact existing accounting entries.\nErroneous rates: %s') % ', '.join(names))

        return super(CurrencyRate, self).create(vals)

    @api.depends('name')
    def _compute_has_accounting_entries(self):
        rates = self._get_rates_with_accounting_entries()
        if rates:
            for rate in self:
                rate.has_accounting_entries = rate.id in rates
        else:
            self.has_accounting_entries = False

    def _get_rates_with_accounting_entries(self):
        if not self.ids:
            return None
        query = """
            WITH rates_select AS (
                SELECT id rate_id, name rate_name, COALESCE(
                    (SELECT name
                       FROM res_currency_rate cr
                      WHERE cr.name > res_currency_rate.name
                        AND cr.currency_id = res_currency_rate.currency_id
                   ORDER BY name
                      LIMIT 1
                    ), CURRENT_DATE + INTERVAL '1 day'
                ) AS following
                  FROM res_currency_rate
                 WHERE res_currency_rate.id in %s
            )
          SELECT rates_select.rate_id
            FROM account_move_line aml
            JOIN res_currency_rate currency_rate ON currency_rate.currency_id = aml.currency_id
            JOIN res_currency_rate company_currency_rate ON company_currency_rate.currency_id = aml.company_currency_id
            JOIN rates_select ON rates_select.rate_id = currency_rate.id OR rates_select.rate_id = company_currency_rate.id
           WHERE aml.date >= rates_select.rate_name
             AND aml.date < rates_select.following
        GROUP BY rates_select.rate_id
                """
        self.env.cr.execute(query, [tuple(self.ids)])
        return self.env.cr.fetchone()
