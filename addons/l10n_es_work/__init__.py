# Part of Odoo. See LICENSE file for full copyright and licensing details.
from . import models

# Technical name of this module, whatever the folder is called.
MODULE = __name__.rsplit('.', 1)[-1]


def _post_init_hook(env):
    """ Create the taxes defined by this module in the companies already using a Spanish chart of accounts.

    The templates of this module are only applied when a chart of accounts is loaded. For the companies
    that already have one, only the data coming from this module is loaded, so the rest of their
    chart of accounts (including the taxes they may have modified) is left untouched.
    """
    companies = env['res.company'].search([
        ('chart_template', '=like', 'es_%'),
        ('parent_id', '=', False),  # branches use the taxes of their root company
    ])
    for company in companies:
        ChartTemplate = env['account.chart.template'].with_company(company).with_context(
            default_company_id=company.id,
            allowed_company_ids=[company.id],
            lang='en_US',
            tracking_disable=True,
            chart_template_load=True,
        )
        data = ChartTemplate._get_chart_template_data(company.chart_template, module=MODULE)
        template_data = data.pop('template_data', {})
        data = ChartTemplate._pre_load_data(company.chart_template, company, template_data, data)
        ChartTemplate._load_data(data)
