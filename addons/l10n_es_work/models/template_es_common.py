# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import Command, models
from odoo.addons.account.models.chart_template import TAX_TAG_DELIMITER, template

# Technical name of this module, whatever the folder is called: the CSV files are read from it.
MODULE = __name__.split('.')[2]


class AccountChartTemplate(models.AbstractModel):
    _inherit = 'account.chart.template'

    @template('es_common', 'account.tax.group')
    def _get_es_common_l10n_es_irpf_partner_account_tax_group(self):
        return self._parse_csv('es_common', 'account.tax.group', module=MODULE)

    @template('es_common', 'account.tax')
    def _get_es_common_l10n_es_irpf_partner_account_tax(self):
        tax_data = self._parse_csv('es_common', 'account.tax', module=MODULE)
        self._l10n_es_irpf_partner_deref_tags(tax_data)
        return tax_data

    def _l10n_es_irpf_partner_deref_tags(self, tax_data):
        mapper = self._get_tag_mapper(self.env.ref('base.es').id)
        for tax_values in tax_data.values():
            for command in tax_values.get('repartition_line_ids', []):
                values = command[2]
                if isinstance(values.get('tag_ids'), str):
                    values['tag_ids'] = [Command.set(mapper(*values['tag_ids'].split(TAX_TAG_DELIMITER)))]
