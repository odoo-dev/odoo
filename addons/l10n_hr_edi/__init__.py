from . import models
from . import wizard


def post_init(env):
    # Loading new field 'l10n_hr_tax_category_id' for existing Croatian taxes
    for company in env['res.company'].search([('chart_template', '=', 'hr')], order="parent_path"):
        env['account.chart.template'].with_company(company)._load_data({
            'account.tax': {
                xmlid: vals
                for xmlid, vals in env['account.chart.template']._parse_csv('hr', 'account.tax', module='l10n_hr_edi').items()
                if env['account.chart.template'].with_company(company).ref(xmlid, raise_if_not_found=True)
            }
        })
