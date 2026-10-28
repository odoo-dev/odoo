from . import models
from .models.template_es_common import L10N_ES_IRPF_PARTNER_RATE_TAXES


def _post_init_hook(env):
    """ Flag the salary withholding taxes of the companies already using a Spanish chart of accounts. """
    for company in env['res.company'].search([('chart_template', '=like', 'es_%')]):
        ChartTemplate = env['account.chart.template'].with_company(company)
        for xmlid in L10N_ES_IRPF_PARTNER_RATE_TAXES:
            tax = ChartTemplate.ref(xmlid, raise_if_not_found=False)
            if tax:
                tax.l10n_es_irpf_partner_rate = True