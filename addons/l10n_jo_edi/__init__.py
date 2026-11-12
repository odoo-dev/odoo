from . import models


def _post_init_hook(env):
    """ Make Jordan companies round their taxes per tax """
    if jo_companies := env['res.company'].search([('chart_template', '=', 'jo_standard')], order="parent_path"):
        for company in jo_companies:
            company.tax_rounding_policy = 'document'
