# -*- coding: utf-8 -*-
import logging
import time

from odoo.fields import Domain
from odoo.modules.loading import force_demo
from odoo.tools import make_index_name, SQL
from odoo.tools.translate import TranslationImporter
from odoo.tests import standalone
from odoo.addons.account.models.chart_template import AccountChartTemplate
from unittest.mock import patch

_logger = logging.getLogger(__name__)


def _load_file(self, filepath, lang, xmlids=None, module=None, original=TranslationImporter.load_file):
    self.imported_langs.add(lang)
    return original(self, filepath, lang, xmlids=xmlids, module=module)


@standalone('all_l10n')
def test_all_l10n(env):
    """ This test will install all the l10n_* modules.
    As the module install is not yet fully transactional, the modules will
    remain installed after the test.
    """

    try_loading = type(env['account.chart.template']).try_loading

    def try_loading_patch(self, template_code, company, install_demo=True, force_create=True):
        self = self.with_context(l10n_check_fields_complete=True)
        return try_loading(self, template_code, company, install_demo, force_create)


    # Ensure the presence of demo data, to see if they can be correctly installed
    if not env.ref('base.module_account').demo:
        force_demo(env)

    # Install prerequisite modules
    _logger.info('Installing prerequisite modules')
    pre_mods = env['ir.module.module'].search([
        ('name', 'in', (
            'stock_account',
            'mrp_accountant',
        )),
        ('state', '=', 'uninstalled'),
    ])
    pre_mods.button_immediate_install()

    # Install the requirements
    _logger.info('Installing all l10n modules')
    l10n_mods = env['ir.module.module'].search([
        '|',
        ('name', '=like', 'l10n_%'),
        ('name', '=like', 'test_l10n_%'),
        ('state', '=', 'uninstalled'),
    ])
    with patch.object(AccountChartTemplate, 'try_loading', try_loading_patch),\
            patch.object(TranslationImporter, 'load_file', _load_file):
        l10n_mods.button_immediate_install()

    # In all_l10n tests we need to verify demo data
    demo_failures = env['ir.demo_failure'].search([])
    if demo_failures:
        _logger.warning("Error while testing demo data for all_l10n tests.")
        for failure in demo_failures:
            _logger.warning("Demo data of module %s has failed: %s",
                failure.module_id.name, failure.error)

    env.transaction.reset()     # clear the set of environments
    idxs = []
    for model in env.registry.values():
        if not model._auto:
            continue

        for field in model._fields.values():
            # TODO: handle non-orm indexes where the account field is alone or first
            if not field.store or field.index \
                    or field.type != 'many2one' \
                    or field.comodel_name != 'account.account':
                continue

            idxname = make_index_name(model._table, field.name)
            env.cr.execute(SQL(
                "CREATE INDEX IF NOT EXISTS %s ON %s (%s)%s",
                SQL.identifier(idxname),
                SQL.identifier(model._table),
                SQL.identifier(field.name),
                SQL("") if field.required else SQL(" WHERE %s IS NOT NULL", SQL.identifier(field.name)),
            ))
            idxs.append(idxname)

    # Install Charts of Accounts
    _logger.info('Loading chart of account')
    already_loaded_codes = set(env['res.company'].search([]).mapped('chart_template'))
    not_loaded_codes = [
        (template_code, template)
        for template_code, template in env['account.chart.template']._get_chart_template_mapping().items()
        if template_code not in already_loaded_codes
        # We can't make it disappear from the list, but we raise a UserError if it's not already the COA
        and template_code not in ('syscohada', 'syscebnl')
    ]
    companies = env['res.company'].create([
        {
            'name': f'company_coa_{template_code}',
            'country_id': template['country_id'],
        }
        for template_code, template in not_loaded_codes
    ])
    env.cr.commit()

    # Install the CoAs
    start = time.time()
    env.cr.execute('ANALYZE')
    logger = logging.getLogger('odoo.loading')
    logger.runbot('ANALYZE took %s seconds', time.time() - start)  # not sure this one is useful
    for (template_code, _template), company in zip(not_loaded_codes, companies):
        env.user.company_ids += company
        env.user.company_id = company
        _logger.info('Testing COA: %s (company: %s)', template_code, company.name)
        try:
            env['account.chart.template'].with_context(l10n_check_fields_complete=True).try_loading(template_code, company, install_demo=True)
            env.cr.commit()
            if company.fiscal_position_ids and not company.domestic_fiscal_position_id:
                _logger.warning("No domestic fiscal position found in fiscal data for %s %s.", company.country_id.name, template_code)
            elif company.fiscal_position_ids:
                potential_domestic_fps = company.fiscal_position_ids.filtered_domain(
                    Domain('country_id', '=', company.country_id.id)
                    | Domain([
                            ('country_id', '=', False),
                            ('country_group_id', 'in', company.country_id.country_group_ids.ids),
                        ]),
                )
                if len(potential_domestic_fps) > 1:
                    potential_domestic_fps.sorted(lambda x: x.country_id.id or float('inf')).sorted('sequence')
                    if ((potential_domestic_fps[0].country_id == potential_domestic_fps[1].country_id) and
                        (potential_domestic_fps[0].sequence == potential_domestic_fps[1].sequence)):
                        _logger.warning("Several fiscal positions fitting for being tagged as domestic were found in fiscal data for %s %s.", company.country_id.name, template_code)

            # Check the tax mappings of the fiscal positions
            fiscal_positions = company.fiscal_position_ids.with_context(active_test=False)
            tax_mappings = [
                (fiscal_position, original_tax, tax)
                for fiscal_position in fiscal_positions
                for tax in fiscal_position.tax_ids
                for original_tax in tax.original_tax_ids - tax
            ]
            mapping_checks = {
                # The domestic fiscal position may replace taxes of other positions, never a domestic one
                "the domestic fiscal position replaces a domestic tax":
                    lambda fiscal_position, original_tax, tax: fiscal_position.is_domestic and original_tax.is_domestic,
                # Only domestic taxes are set by default on lines, so they are the only ones worth replacing
                "a non-domestic fiscal position replaces a non-domestic tax":
                    lambda fiscal_position, original_tax, tax: not fiscal_position.is_domestic and not original_tax.is_domestic,
                "a tax is replaced by a tax of another type":
                    lambda fiscal_position, original_tax, tax: original_tax.type_tax_use != tax.type_tax_use,
                "an active tax is replaced by an archived tax":
                    lambda fiscal_position, original_tax, tax: original_tax.active and not tax.active,
                "a tax is replaced by a tax of another scope":
                    lambda fiscal_position, original_tax, tax: original_tax.tax_scope != tax.tax_scope,
            }
            fiscal_position_xmlids = fiscal_positions.get_external_id()
            tax_xmlids = (fiscal_positions.tax_ids | fiscal_positions.tax_ids.original_tax_ids).get_external_id()
            for message, check in mapping_checks.items():
                if errors := [
                    f"{fiscal_position_xmlids[fiscal_position.id]}: {tax_xmlids[original_tax.id]} -> {tax_xmlids[tax.id]}"
                    for fiscal_position, original_tax, tax in tax_mappings
                    if check(fiscal_position, original_tax, tax)
                ]:
                    _logger.warning("In fiscal data for %s %s, %s: %s", company.country_id.name, template_code, message, ", ".join(errors))
        except Exception:
            _logger.error("Error when creating COA %s", template_code, exc_info=True)
            env.cr.rollback()

    env.cr.execute(SQL("DROP INDEX %s", SQL(", ").join(map(SQL.identifier, idxs))))
    env.cr.commit()
