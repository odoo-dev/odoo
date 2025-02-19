from contextlib import contextmanager

from odoo import Command
from odoo.tests import TransactionCase, tagged

@tagged('-at_install', 'post_install')
class TestIrAggregate(TransactionCase):
    @contextmanager
    def _assert_aggregate_query(self):
        queries = []
        yield from self._patchExecute(queries)
        self.assertEqual(len(queries), 1, queries)
        self.assertIn("ir_aggregate", queries[0])

    def _assert_aggregate(self, model_name, domain, groupby, aggregates, having=None, context=None, expected=None):
        context = context or {}
        having = having or []
        with self._assert_aggregate_query():
            result = self.env[model_name].with_context(**context)._read_group(
                domain=domain,
                groupby=groupby,
                aggregates=aggregates,
                having=having,
            )
        self.assertEqual(
            sorted(result),
            sorted(self.env[model_name].with_context(**context, ignore_ir_aggregate=True)._read_group(
                domain=domain + having,
                groupby=groupby,
                aggregates=aggregates,
                # having=having,  # TODO syntax is not exactly the same
            ))
        )
        if expected:
            self.assertEqual(sorted(result), expected)

    def test_merge(self):
        config = self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'domain': [(0, '=', 1)],
        })

        self.env['ir.aggregate'].create([{
            'config_id': config.id,
            'value': {'__count': 1},
        }] * 2)
        self.assertRecordValues(
            self.env['ir.aggregate'].search([('config_id', '=', config.id)]),
            [{'value': {'__count': 1}}] * 2,
        )

        self.env['ir.aggregate']._merge()
        self.assertRecordValues(
            self.env['ir.aggregate'].search([('config_id', '=', config.id)]),
            [{'value': {'__count': 2}}],
        )

        self.env['ir.aggregate'].create([{
            'config_id': config.id,
            'value': {'__count': -1},
        }] * 2)
        self.assertRecordValues(
            self.env['ir.aggregate'].search([('config_id', '=', config.id)]),
            [{'value': {'__count': 2}}] + [{'value': {'__count': -1}}] * 2,
        )

        self.env['ir.aggregate']._merge()
        self.assertFalse(self.env['ir.aggregate'].search([('config_id', '=', config.id)]))

    def test_crud_count(self):
        def assert_count():
            self.assertEqual(
                self.env['ir.aggregate'].get_values('res.partner', domain, (), ('__count',)),
                [(current_partner_count,)]
            )

        domain = [('name', '=ilike', 'A%')]
        self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'domain': domain,
        })

        current_partner_count = self.env['res.partner'].search_count(domain)
        assert_count()

        # A partner that starts within the domain
        partner_a = self.env['res.partner'].create({'name': 'Azure'})
        current_partner_count += 1
        assert_count()

        # Stays in the domain
        partner_a.name = 'A nothing changes'
        assert_count()

        # Gets out of the domain
        partner_a.name = 'Something else'
        current_partner_count -= 1
        assert_count()

        # Stays "out of the domain"
        partner_a.unlink()
        assert_count()

        # A partner that starts outside the domain
        partner_b = self.env['res.partner'].create({'name': 'Deco'})
        assert_count()

        # Stay out of the domain
        partner_b.name = 'Nothing changes'
        assert_count()

        # Get in the domain
        partner_b.name = 'A in the count'
        current_partner_count += 1
        assert_count()

        # Get "out of the domain"
        partner_b.unlink()
        current_partner_count -= 1
        assert_count()

        # Count multiple at once
        self.env['res.partner'].create([
            {'name': 'A Deco'},
            {'name': 'A Azure'},
        ])
        current_partner_count += 2
        assert_count()

    def test_crud_field_agg(self):
        domain = [('name', '=', 'test partner')]
        self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'field_ids': self.env['ir.model.fields']._get('res.partner', 'color').ids,
            'domain': domain,
        })

        self.assertEqual(self.env['ir.aggregate'].get_values('res.partner', domain, (), ('color',)), [(None,)])
        self._assert_aggregate(
            model_name='res.partner',
            domain=domain,
            groupby=(),
            aggregates=['color:sum'],
            expected=[(False,)],
        )

        partner = self.env['res.partner'].create({
            'name': 'test partner',
            'color': 2,
        })
        self._assert_aggregate(
            model_name='res.partner',
            domain=domain,
            groupby=(),
            aggregates=['color:sum'],
            expected=[(2,)],
        )

        partner.color = 3
        self._assert_aggregate(
            model_name='res.partner',
            domain=domain,
            groupby=(),
            aggregates=['color:sum'],
            expected=[(3,)],
        )

        partner.unlink()
        self.assertEqual(self.env['ir.aggregate'].get_values('res.partner', domain, (), ('color',)), [(None,)])

    def test_groupby(self):
        domain = [('active', 'in', [True, False])]
        self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'groupby_ids': [
                Command.create({'field_id': self.env['ir.model.fields']._get('res.partner', 'country_id').id}),
                Command.create({'field_id': self.env['ir.model.fields']._get('res.partner', 'active').id}),
            ],
            'domain': domain,
        })

        be = self.env['res.country'].search([('code', '=', 'BE')])
        us = self.env['res.country'].search([('code', '=', 'US')])
        current_be_count = self.env['res.partner'].search_count([('country_id', '=', be.id)])
        current_us_count = self.env['res.partner'].search_count([('country_id', '=', us.id)])

        self.assertEqual(self.env['ir.aggregate'].get_values('res.partner', domain, ('country_id', 'active'), ('__count',)), [
            (be.id, True, current_be_count),
            (us.id, True, current_us_count),
            (None, False, 3),
        ])

        self.env['res.partner'].create({'name': 'BE 1', 'country_id': be.id, 'active': False})
        self.env['res.partner'].create({'name': 'BE 2', 'country_id': be.id})
        self.env['res.partner'].create({'name': 'US', 'country_id': us.id})

        self.assertEqual(self.env['ir.aggregate'].get_values('res.partner', domain, ('country_id', 'active'), ('__count',)), [
            (be.id, True, current_be_count + 1),
            (us.id, True, current_us_count + 1),
            (None, False, 3),
            (be.id, False, 1),
        ])

        self._assert_aggregate(
            model_name='res.partner',
            domain=domain,
            groupby=['country_id', 'active'],
            aggregates=['__count'],
        )

        self._assert_aggregate(
            model_name='res.partner',
            domain=domain,
            groupby=['country_id', 'active'],
            aggregates=['__count'],
            having=[('active', '=', False)]
        )

    def test_groupby_granularity(self):
        test_day = self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'groupby_ids': [Command.create({
                'field_id': self.env['ir.model.fields']._get('res.partner', 'create_date').id,
                'granularity': 'day',
            })]
        })
        test_month = self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'groupby_ids': [Command.create({
                'field_id': self.env['ir.model.fields']._get('res.partner', 'create_date').id,
                'granularity': 'month',
            })]
        })
        test_year = self.env['ir.aggregate.config'].create({
            'model_id': self.env['ir.model']._get('res.partner').id,
            'groupby_ids': [Command.create({
                'field_id': self.env['ir.model.fields']._get('res.partner', 'create_date').id,
                'granularity': 'year',
            })]
        })

        feb_2 = self.env['res.partner'].create({'name': 'February 2'})
        self.env.cr.execute("UPDATE res_partner SET create_date = '3000-02-02' WHERE id = %s", [feb_2.id])
        feb_3 = self.env['res.partner'].create({'name': 'February 3'})
        self.env.cr.execute("UPDATE res_partner SET create_date = '3000-02-03' WHERE id = %s", [feb_3.id])
        mar_4 = self.env['res.partner'].create({'name': 'March 4'})
        self.env.cr.execute("UPDATE res_partner SET create_date = '3000-03-04' WHERE id = %s", [mar_4.id])

        (test_day + test_month + test_year).refresh_counters()  # needed because we manipulated data in SQL directly

        # self.assertEqual(self.env['ir.aggregate']._get_value('test day', {'create_date:day': "3000-02-02"}), 1)
        # self.assertEqual(self.env['ir.aggregate']._get_value('test day', {'create_date:day': "3000-02-03"}), 1)
        # self.assertEqual(self.env['ir.aggregate']._get_value('test day', {'create_date:day': "3000-03-04"}), 1)
        # self.assertEqual(self.env['ir.aggregate']._get_value('test month', {'create_date:month': "3000-02-01"}), 2)
        # self.assertEqual(self.env['ir.aggregate']._get_value('test month', {'create_date:month': "3000-03-01"}), 1)
        # self.assertEqual(self.env['ir.aggregate']._get_value('test year', {'create_date:year': "3000-01-01"}), 3)

        for granularity in ['day', 'month', 'year']:
            self._assert_aggregate(
                model_name='res.partner',
                domain=[],
                groupby=[f'create_date:{granularity}'],
                aggregates=['__count'],
            )

    # def test_perf(self):
    #     import random
    #     import contextlib
    #     import time
    #     import datetime
    #     from ast import literal_eval
    #     from dateutil.relativedelta import relativedelta
    #     from unittest.mock import patch
    #     random.seed(0)

    #     CONFIGS = 10
    #     LINES = 1_000_000
    #     GROUPS = 100

    #     @contextlib.contextmanager
    #     def timeit(name):
    #         start = time.perf_counter()
    #         yield
    #         print(name, f"{time.perf_counter() - start:.6f}s")

    #     def test_read_group(configs):
    #         for config in configs:
    #             with timeit(config.domain):
    #                 self.env['account.analytic.line']._read_group(
    #                     domain=literal_eval(config.domain),
    #                     groupby=config._grouping_key(),
    #                     aggregates=('__count',),
    #                 )
    #             with timeit(f"{config.domain} non optimized"):
    #                 self.env['account.analytic.line'].with_context(ignore_ir_aggregate=True)._read_group(
    #                     domain=literal_eval(config.domain),
    #                     groupby=config._grouping_key(),
    #                     aggregates=('__count',),
    #                 )

    #     project_plan, _other_plans = self.env['account.analytic.plan']._get_all_plans()
    #     accounts = self.env['account.analytic.account'].create([{
    #         'name': i,
    #         'code': i,
    #         'plan_id': project_plan.id,
    #     } for i in range(CONFIGS)])
    #     configs = self.env['ir.aggregate.config'].create([{
    #         'model_id': self.env['ir.model']._get('account.analytic.line').id,
    #         'groupby': 'date:day',
    #         'domain': [('account_id', '=', accounts[i].id)]
    #     } for i in range(CONFIGS)])
    #     reference = datetime.date(2000, 1, 1)

    #     for i in range(1):  # Avoid memory error in create
    #         with timeit('create'):
    #             self.env['account.analytic.line'].create([
    #                 {
    #                     'name': 'test',
    #                     'account_id': random.choice(accounts).id,
    #                     'amount': 1,
    #                     'date': reference + relativedelta(days=random.randint(0, GROUPS)),
    #                 }
    #                 for i in range(LINES)
    #             ])
    #         with timeit('flush'), patch.object(self.env.registry['ir.aggregate'], '_preprocess_create_vals', lambda s, l: l):
    #             self.env['ir.aggregate']._flush_create()

    #     self.env.cr.execute("ANALYZE ir_aggregate; COMMIT;")

    #     print()
    #     test_read_group(configs)

    #     print()
    #     with timeit('count'):
    #         print(self.env['ir.aggregate'].search_count([]))
    #     with timeit('merge'):
    #         self.env['ir.aggregate']._merge()
    #     self.env.cr.execute("COMMIT;")
    #     with timeit('count'):
    #         print(self.env['ir.aggregate'].search_count([]))

    #     with timeit('remerge'):
    #         self.env['ir.aggregate']._merge()
    #     with timeit('count'):
    #         print(self.env['ir.aggregate'].search_count([]))

    #     print()
    #     test_read_group(configs)

    #     configs.unlink()
    #     self.env.cr.execute("COMMIT;")
