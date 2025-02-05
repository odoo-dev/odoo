from odoo import fields, models, tools


class EsgEmittedEmissionReport(models.Model):
    _name = 'esg.emitted.emission.report'
    _description = 'ESG Emitted Emissions Report'
    _auto = False

    date = fields.Date(required=True)
    emission_factor_id = fields.Many2one('esg.emission.factor', required=True)
    move_id = fields.Many2one('account.move', string='Bill')
    note = fields.Text()
    quantity = fields.Integer(required=True)
    value = fields.Float(string='CO2')
    uncertainty = fields.Float(related='emission_factor_id.uncertainty')
    vendor_id = fields.Many2one(related='move_id.partner_id')
    scope = fields.Selection(related='emission_factor_id.source_id.scope')
    activity_type_ids = fields.Many2many(related='emission_factor_id.activity_type_ids')

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
                  SELECT
                    oe.id AS id,
                    oe.date AS date,
                    oe.emission_factor_id AS emission_factor_id,
                    NULL AS move_id,
                    oe.note AS note,
                    oe.quantity as quantity,
                    oe.value as value,
                    ef.uncertainty as uncertainty
                  FROM esg_other_emission oe
                  LEFT JOIN esg_emission_factor ef ON ef.id = oe.emission_factor_id
                  UNION
                  SELECT
                    -aml.id AS id,
                    aml.date AS date,
                    aml.emission_factor_id AS emission_factor_id,
                    aml.move_id as move_id,
                    NULL AS note,
                    aml.quantity as quantity,
                    aml.total_value as value,
                    ef.uncertainty as uncertainty
                  FROM account_move_line aml
                  LEFT JOIN esg_emission_factor ef ON ef.id = aml.emission_factor_id
                  WHERE aml.emission_factor_id IS NOT NULL
            )
        """)

    def write(self, vals):
      # To refactor
      account_move_line_vals = {
        field: value
        for field, value in vals.items()
        if field in ['emission_factor_id', 'quantity']
      }

      other_emission_vals = dict(account_move_line_vals)
      if 'date' in vals:
        other_emission_vals['date'] = vals['date']
      if 'note' in vals:
        other_emission_vals['note'] = vals['note']

      other_emissions_from_report = self.filtered(lambda rec: rec.id > 0)
      account_move_lines_from_report =  self.filtered(lambda rec: rec.id < 0)

      for field, value in other_emission_vals.items():
        self.env.cache._set_field_cache(other_emissions_from_report, self._fields.get(field)).update(dict.fromkeys(other_emissions_from_report.ids, value))

      for field, value in account_move_line_vals.items():
        self.env.cache._set_field_cache(account_move_lines_from_report, self._fields.get(field)).update(dict.fromkeys(account_move_lines_from_report.ids, value))

      other_emissions = self.env['esg.other.emission'].browse(other_emissions_from_report.ids)
      account_move_lines = self.env['account.move.line'].browse(account_move_lines_from_report.mapped(lambda aml: -aml.id))
      res = other_emissions.write(other_emission_vals) and account_move_lines.write(account_move_line_vals)

      if vals.get('quantity') or vals.get('emission_factor_id'):
        other_emissions_mapping = {
          emission.id: {
            'value': emission.value,
            'uncertainty': emission.uncertainty,
          } for emission in other_emissions
        }

        account_move_lines_mapping = {
          line.id: {
            'value': line.total_value,
            'uncertainty': line.uncertainty,
          } for line in account_move_lines
        }

        for emission in other_emissions_from_report:
          for field in ['value', 'uncertainty']:
            self.env.cache._set_field_cache(emission, self._fields.get(field)).update({emission.id: other_emissions_mapping.get(emission.id).get(field)})

        for line in account_move_lines_from_report:
          for field in ['value', 'uncertainty']:
            self.env.cache._set_field_cache(line, self._fields.get(field)).update({line.id: account_move_lines_mapping.get(-line.id).get(field)})

      return res
