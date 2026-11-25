from datetime import datetime

from odoo.fields import Command
from odoo.tests import Form, tagged

from odoo.addons.mrp.tests.common import TestMrpCommon


@tagged('post_install', '-at_install')
class TestProductionSequence(TestMrpCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.user.tz = 'UTC'
        cls.env.user.group_ids += cls.env.ref('mrp.group_mrp_routings')

    def _create_mo(self, deadline=False, date_start=datetime(2027, 3, 1, 8)):
        return self.env['mrp.production'].create({
            'product_id': self.product_5.id,
            'bom_id': self.bom_2.id,
            'product_qty': 1,
            'date_start': date_start,
            'date_deadline': deadline,
        })

    def test_sequence_initialized_from_deadline(self):
        mo_with_deadline = self._create_mo(deadline=datetime(2027, 1, 1, 10))
        mo_without_deadline = self._create_mo(date_start=datetime(2027, 2, 15, 10))
        self.assertEqual(mo_with_deadline.sequence, 20270101)
        self.assertEqual(mo_without_deadline.sequence, 99999999, "Without deadline, the MO comes last")
        mo_copy = mo_with_deadline.copy()
        self.assertFalse(mo_copy.date_deadline)
        self.assertEqual(mo_copy.sequence, 99999999, "A copy gets a new sequence")

    def test_sequence_not_recomputed(self):
        mo = self._create_mo(deadline=datetime(2027, 1, 1, 10))
        mo.date_deadline = datetime(2027, 6, 1, 10)
        mo.date_start = datetime(2027, 5, 1, 10)
        self.assertEqual(mo.sequence, 20270101, "The sequence is only set at creation")

    def test_sequence_from_form(self):
        mo_form = Form(self.env['mrp.production'])
        mo_form.product_id = self.product_5
        mo_form.date_start = datetime(2027, 4, 2, 10)
        mo = mo_form.save()
        self.assertEqual(mo.sequence, 99999999, "No deadline: last")
        # a deadline set afterwards gives the MO its place, removing it puts it back at the end
        mo.date_deadline = datetime(2027, 4, 20, 10)
        self.assertEqual(mo.sequence, 20270420)
        mo.date_deadline = False
        self.assertEqual(mo.sequence, 99999999)

    def test_swap_productions(self):
        """ Swapping two MOs exchanges their sequences, their ids are left untouched. """
        mo_1 = self._create_mo(deadline=datetime(2027, 1, 1, 10))
        mo_2 = self._create_mo(deadline=datetime(2027, 1, 5, 10))
        mo_3 = self._create_mo(deadline=datetime(2027, 1, 9, 10))
        # drag MO2 before MO1: the web client sends the moved range in its new order
        (mo_2 | mo_1).web_resequence({'sequence': {}})
        self.assertEqual((mo_1.sequence, mo_2.sequence, mo_3.sequence), (20270105, 20270101, 20270109))
        # drag MO3 first: all the range shifts
        (mo_3 | mo_2 | mo_1).web_resequence({'sequence': {}})
        self.assertEqual((mo_3.sequence, mo_2.sequence, mo_1.sequence), (20270101, 20270105, 20270109))
        productions = self.env['mrp.production'].search([('id', 'in', (mo_1 | mo_2 | mo_3).ids)], order='sequence, id')
        self.assertEqual(productions, mo_3 | mo_2 | mo_1)

    def test_swap_productions_same_sequence(self):
        """ MOs sharing a sequence get distinct ones to keep the order chosen by the user. """
        mo_1 = self._create_mo(deadline=datetime(2027, 1, 1, 10))
        mo_2 = self._create_mo(deadline=datetime(2027, 1, 1, 16))
        self.assertEqual(mo_1.sequence, mo_2.sequence)
        (mo_2 | mo_1).web_resequence({'sequence': {}})
        self.assertEqual((mo_2.sequence, mo_1.sequence), (20270101, 20270102))

    def test_swap_workorders(self):
        """ Reordering work orders reorders their manufacturing orders. """
        mo_1 = self._create_mo(deadline=datetime(2027, 1, 1, 10))
        mo_2 = self._create_mo(deadline=datetime(2027, 1, 5, 10))
        (mo_1 | mo_2).action_confirm()
        wo_1 = mo_1.workorder_ids[0]
        wo_2 = mo_2.workorder_ids[0]
        self.assertEqual((wo_1.production_sequence, wo_2.production_sequence), (20270101, 20270105))
        res = (wo_2 | wo_1).web_resequence({'production_sequence': {}}, field_name='production_sequence')
        self.assertEqual((mo_1.sequence, mo_2.sequence), (20270105, 20270101))
        self.assertEqual(
            {r['id']: r['production_sequence'] for r in res},
            {wo_1.id: 20270105, wo_2.id: 20270101},
        )
        # the other work orders of the MOs follow
        self.assertEqual(set(mo_2.workorder_ids.mapped('production_sequence')), {20270101})

    def test_progress_and_deadline_color(self):
        mo = self._create_mo(deadline=datetime(2027, 1, 1, 10), date_start=datetime(2027, 3, 1, 8))
        mo.action_confirm()
        self.assertEqual(mo.deadline_color, 1, "Scheduled end after the deadline: red")
        self.assertTrue(mo.is_late_on_deadline)
        mo.date_deadline = datetime(2028, 1, 1)
        self.assertEqual(mo.deadline_color, 0)
        self.assertFalse(mo.is_late_on_deadline)
        self.assertEqual(mo.progress, 0)
        expected = mo.duration_expected
        self.assertTrue(expected)
        mo.workorder_ids[0].duration = expected / 4
        self.assertAlmostEqual(mo.progress, 100 * (expected / 4) / mo.duration_expected)

    def test_workcenter_tags(self):
        """ The kanban card shows the work centers of the work orders in progress, then of all
        the work orders to do. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_5.product_tmpl_id.id,
            'product_qty': 1,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'time_cycle_manual': 60, 'sequence': 1}),
                Command.create({'name': 'Assemble', 'workcenter_id': self.workcenter_2.id, 'time_cycle_manual': 60, 'sequence': 2}),
                Command.create({'name': 'Pack', 'workcenter_id': self.workcenter_3.id, 'time_cycle_manual': 60, 'sequence': 3}),
            ],
        })
        mo = self.env['mrp.production'].create({'product_id': self.product_5.id, 'bom_id': bom.id, 'product_qty': 1})
        self.assertEqual(mo.workcenter_tags, [], "No tag for a draft MO")
        mo.action_confirm()
        names = [wc.display_name for wc in (self.workcenter_1, self.workcenter_2, self.workcenter_3)]

        def tags():
            mo.invalidate_recordset(['workcenter_tags'])
            return [(tag['name'], tag['state']) for tag in mo.workcenter_tags]

        # the work orders are done one after the other: only the next one is to do (others blocked)
        self.assertEqual(mo.workorder_ids.mapped('state'), ['ready', 'blocked', 'blocked'])
        self.assertEqual(tags(), [(names[0], 'ready')])
        mo.workorder_ids[0].button_start()
        self.assertEqual(tags(), [(names[0], 'progress')])
        mo.workorder_ids[0].button_finish()
        self.assertEqual(tags(), [(names[1], 'ready')])
        # several work orders to do (no dependency between them): all their work centers
        mo.workorder_ids[2].blocked_by_workorder_ids = False
        self.assertEqual(tags(), [(names[1], 'ready'), (names[2], 'ready')])
        mo.workorder_ids[1].button_start()
        self.assertEqual(tags(), [(names[1], 'progress'), (names[2], 'ready')])

    def test_productions_without_deadline_last(self):
        mo_no_deadline = self._create_mo()
        mo_late = self._create_mo(deadline=datetime(2030, 12, 31, 10))
        mo_soon = self._create_mo(deadline=datetime(2027, 1, 1, 10))
        productions = self.env['mrp.production'].search(
            [('id', 'in', (mo_no_deadline | mo_late | mo_soon).ids)], order='sequence, id')
        self.assertEqual(productions, mo_soon | mo_late | mo_no_deadline)
