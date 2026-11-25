import re
from datetime import datetime

from dateutil.relativedelta import relativedelta

from freezegun import freeze_time

from odoo.tests import tagged

from odoo.addons.mrp.tests.common import TestMrpCommon


@tagged('post_install', '-at_install')
class TestProductionDates(TestMrpCommon):

    _test_user_groups = (
        'mrp.group_mrp_user',
        'mrp.group_mrp_routings',
    )

    def _create_mo(self):
        mo = self.env['mrp.production'].create({
            'product_id': self.product_5.id,
            'bom_id': self.bom_2.id,
            'product_qty': 1,
            'date_start': datetime(2027, 3, 1, 8),
        })
        mo.action_confirm()
        return mo

    def test_manual_date_finished_is_kept(self):
        mo = self._create_mo()
        computed_end = mo.date_finished
        self.assertTrue(computed_end > mo.date_start)
        mo.write({'date_finished': datetime(2027, 3, 10, 17), 'date_finished_manual': True})
        mo.date_start = datetime(2027, 3, 2, 8)
        mo.workorder_ids[0].duration_expected += 600
        self.assertEqual(mo.date_finished, datetime(2027, 3, 10, 17), "A manual end date is not recomputed")
        mo.date_finished_manual = False
        self.assertNotEqual(mo.date_finished, datetime(2027, 3, 10, 17), "Back to a computed end date")

    def test_date_finished_in_progress(self):
        """ The end of an in-progress MO is now + the remaining time of its work orders. """
        mo = self._create_mo()
        workorder = mo.workorder_ids[0]
        with freeze_time('2027-03-01 10:00:00'):
            workorder.button_start()
            self.assertEqual(mo.state, 'progress')
            workorder.duration = workorder.duration_expected / 2
            remaining = sum(mo.workorder_ids.mapped('remaining_time'))
            self.assertEqual(mo.date_finished, datetime(2027, 3, 1, 10) + (datetime(2027, 1, 1, 0, int(remaining)) - datetime(2027, 1, 1)))

    def test_manual_dates_fixed_until_reordered(self):
        mo_1, mo_2 = self._create_mo(), self._create_mo()
        mo_1.write({
            'date_start': datetime(2027, 3, 5, 8), 'date_start_manual': True,
            'date_finished': datetime(2027, 3, 6, 17), 'date_finished_manual': True,
        })
        # starting the production doesn't move the manual dates
        with freeze_time('2027-03-04 10:00:00'):
            mo_1.workorder_ids[0].button_start()
            mo_1.workorder_ids[0].duration = 10
        self.assertEqual(mo_1.state, 'progress')
        self.assertEqual(mo_1.date_start, datetime(2027, 3, 5, 8))
        self.assertEqual(mo_1.date_finished, datetime(2027, 3, 6, 17))
        self.assertTrue(mo_1.date_start_manual and mo_1.date_finished_manual)
        # reordering the MOs releases the manual dates
        (mo_2 | mo_1).web_resequence({'sequence': {}})
        self.assertFalse(mo_1.date_start_manual or mo_1.date_finished_manual)
        self.assertNotEqual(mo_1.date_finished, datetime(2027, 3, 6, 17), "The end is computed again")

    def test_planning_sets_dates_manually(self):
        """ Planning an MO is equivalent to setting its dates manually: they are those of its
        work orders, and computed again once the MO is unplanned. """
        mo = self._create_mo()
        mo.write({'date_finished': datetime(2027, 3, 20, 17), 'date_finished_manual': True})
        mo.button_plan()
        self.assertTrue(mo.is_planned)
        self.assertTrue(mo.date_start_manual and mo.date_finished_manual)
        self.assertEqual(mo.date_finished, mo.workorder_ids[-1].date_finished, "Planning takes the planned dates")
        # moving the work orders moves the MO, which stays manual
        new_end = mo.workorder_ids[-1].date_finished + relativedelta(days=2)
        mo.workorder_ids[-1].write({'date_start': mo.workorder_ids[-1].date_start + relativedelta(days=2), 'date_finished': new_end})
        self.assertEqual(mo.date_finished, new_end)
        self.assertTrue(mo.date_finished_manual)
        # reordering MOs doesn't release the dates of a planned MO
        other = self._create_mo()
        (other | mo).web_resequence({'sequence': {}})
        self.assertTrue(mo.date_start_manual and mo.date_finished_manual)
        # unplanning releases them
        mo.button_unplan()
        self.assertFalse(mo.date_start_manual or mo.date_finished_manual)


    def test_dates_not_tracked_in_chatter(self):
        mo = self.env['mrp.production'].create({
            'product_id': self.product_5.id,
            'bom_id': self.bom_2.id,
            'product_qty': 1,
        })
        self.env.flush_all()
        self.env.cr.precommit.run()  # generate the tracking messages
        messages_before = mo.message_ids
        mo.write({
            'date_start': datetime(2027, 3, 3, 8),
            'date_finished': datetime(2027, 3, 4, 8),
            'date_deadline': datetime(2027, 3, 9, 8),
            'product_qty': 2,
        })
        self.env.flush_all()
        self.env.cr.precommit.run()  # generate the tracking messages
        # tracking values are logged in the message body as "old → <b>new</b> <i>(Field Label)</i>"
        bodies = ''.join(str(body) for body in (mo.message_ids - messages_before).mapped('body'))
        tracked = set(re.findall(r'<i>\((.*?)\)</i>', bodies))
        fields = mo._fields
        self.assertFalse(
            {fields['date_start'].string, fields['date_finished'].string, fields['date_deadline'].string} & tracked,
            "The dates are not tracked")
        self.assertIn(fields['product_qty'].string, tracked, "The other tracked fields still are")

@tagged('post_install', '-at_install')
class TestProductionScheduling(TestMrpCommon):
    """ Start/end dates computed one MO after the other, from the sequence and the weekly capacity,
    on the production working schedule (Monday to Friday, 8 AM - 4 PM). """

    _test_user_groups = (
        'mrp.group_mrp_manager',
    )

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env.company.sudo().write({'tz': 'UTC', 'mrp_weekly_capacity': 40})

    def _create_mos(self, count, deadline_day=10):
        # no work orders: 1 hour each
        mos = self.env['mrp.production'].create([{
            'product_id': self.product_4.id,
            'bom_id': self.bom_1.id,
            'product_qty': 4,
            'date_deadline': datetime(2027, 3, deadline_day + i, 12),
        } for i in range(count)])
        mos.action_confirm()
        return mos

    def _dates(self, mos):
        return [(mo.date_start, mo.date_finished) for mo in mos]

    @freeze_time('2027-03-01 06:30:00')  # Monday, before the working day
    def test_schedule_one_after_the_other(self):
        mos = self._create_mos(3)
        self.assertEqual(self._dates(mos), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),
            (datetime(2027, 3, 1, 10), datetime(2027, 3, 1, 11)),
        ])
        self.assertFalse(any(mos.mapped('date_start_manual')), "Computed dates are not manual")
        # twice the capacity of the working schedule: 2 MOs per hour, each still lasting 1 hour
        wizard = self.env['mrp.production.capacity'].create({'weekly_capacity': 80})
        wizard.action_save()
        self.assertEqual(self._dates(mos), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 8, 30), datetime(2027, 3, 1, 9, 30)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),
        ])
        # a quarter of the working schedule: the next MO starts 4 working hours later
        wizard = self.env['mrp.production.capacity'].create({'weekly_capacity': 10})
        wizard.action_save()
        self.assertEqual(self._dates(mos), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),  # end = start + remaining time
            (datetime(2027, 3, 1, 12), datetime(2027, 3, 1, 13)),
            (datetime(2027, 3, 2, 8), datetime(2027, 3, 2, 9)),  # 4 working hours after 12:00
        ])

    @freeze_time('2027-03-05 15:30:00')  # Friday afternoon
    def test_schedule_on_working_schedule(self):
        mos = self._create_mos(2)
        self.assertEqual(self._dates(mos), [
            (datetime(2027, 3, 5, 15, 30), datetime(2027, 3, 8, 8, 30)),  # 30 min on Friday, 30 min on Monday
            (datetime(2027, 3, 8, 8, 30), datetime(2027, 3, 8, 9, 30)),
        ])

    @freeze_time('2027-03-01 06:30:00')
    def test_schedule_manual_and_reorder(self):
        mo_1, mo_2, mo_3 = self._create_mos(3)
        mo_2.write({'date_start': datetime(2027, 3, 1, 13), 'date_start_manual': True})
        self.assertEqual(self._dates(mo_1 | mo_2 | mo_3), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 13), datetime(2027, 3, 1, 14)),  # fixed, out of the scheduling
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),  # not after the fixed one
        ])
        # reorder: MO3 first, the manual date of MO2 is released
        (mo_3 | mo_1 | mo_2).web_resequence({'sequence': {}})
        self.assertFalse(mo_2.date_start_manual)
        self.assertEqual(self._dates(mo_3 | mo_1 | mo_2), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),
            (datetime(2027, 3, 1, 10), datetime(2027, 3, 1, 11)),
        ])
        # a done MO frees its slot
        mo_3.button_mark_done()
        self.assertEqual(self._dates(mo_1 | mo_2), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),
        ])

    @freeze_time('2027-03-01 06:30:00')
    def test_schedule_manual_start_from_form_and_kanban_move(self):
        mo_1, mo_2 = self._create_mos(2)
        # set in the form: the widget sends the flag with the date, which then stays fixed
        mo_1.write({'date_start': datetime(2027, 3, 3, 10), 'date_start_manual': True})
        self.env['mrp.production']._schedule_productions()
        self.assertEqual(self._dates(mo_1), [(datetime(2027, 3, 3, 10), datetime(2027, 3, 3, 11))])
        self.assertTrue(mo_1.date_start_manual)
        # moved to another column of the kanban (date written without the flag): automatic again
        mo_1.write({'date_start': datetime(2027, 3, 8, 8)})
        self.assertFalse(mo_1.date_start_manual)
        self.assertEqual(self._dates(mo_1 | mo_2), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),
        ])

    @freeze_time('2027-03-01 06:30:00')
    def test_schedule_around_fixed_dates(self):
        """ An MO with a manual start is not scheduled with the others, but its time is still
        taken from the capacity: the other MOs are scheduled around it. """
        mo_1, mo_2, mo_3, mo_4 = self._create_mos(4)
        mo_4.write({'date_start': datetime(2027, 3, 1, 9, 30), 'date_start_manual': True})
        self.assertEqual(self._dates(mo_1 | mo_2 | mo_3 | mo_4), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 10, 30), datetime(2027, 3, 1, 11, 30)),  # 9:00 - 10:00 overlaps MO 4
            (datetime(2027, 3, 1, 11, 30), datetime(2027, 3, 1, 12, 30)),
            (datetime(2027, 3, 1, 9, 30), datetime(2027, 3, 1, 10, 30)),  # fixed
        ])
        # twice the capacity of the working schedule: MO 4 only uses 9:30 - 10:00 of it
        self.env['mrp.production.capacity'].create({'weekly_capacity': 80}).action_save()
        self.assertEqual(self._dates(mo_1 | mo_2 | mo_3), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 8, 30), datetime(2027, 3, 1, 9, 30)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),  # its slot 9:00 - 9:30 is free
        ])

    @freeze_time('2027-03-01 06:30:00')
    def test_reorder_recomputes_all_dates(self):
        """ Swapping 2 MOs recomputes the dates of all the MOs from their position, including the
        manual dates of MOs that were not moved. """
        mo_1, mo_2, mo_3 = self._create_mos(3)
        mo_3.write({'date_start': datetime(2027, 3, 5, 10), 'date_start_manual': True})
        (mo_2 | mo_1).web_resequence({'sequence': {}})
        self.assertFalse(mo_3.date_start_manual)
        self.assertEqual(self._dates(mo_2 | mo_1 | mo_3), [
            (datetime(2027, 3, 1, 8), datetime(2027, 3, 1, 9)),
            (datetime(2027, 3, 1, 9), datetime(2027, 3, 1, 10)),
            (datetime(2027, 3, 1, 10), datetime(2027, 3, 1, 11)),
        ])

    @freeze_time('2027-03-01 06:30:00')
    def test_plan_as_soon_as_possible(self):
        """ Planning an MO plans its work orders as soon as possible, whatever its scheduled
        position, and fixes its dates. """
        self.env.user.group_ids += self.env.ref('mrp.group_mrp_routings')
        mo_1, mo_2 = self._create_mos(2)
        mo_3 = self.env['mrp.production'].create({
            'product_id': self.product_5.id, 'bom_id': self.bom_2.id, 'product_qty': 1,
            'date_deadline': datetime(2027, 3, 20, 12),  # last in the sequence
        })
        mo_3.action_confirm()
        self.assertGreaterEqual(mo_3.date_start, mo_2.date_finished, "Scheduled after the other MOs")
        mo_3.button_plan()
        self.assertTrue(mo_3.is_planned and mo_3.date_start_manual)
        first_wo = mo_3.workorder_ids.sorted('date_start')[0]
        self.assertEqual(mo_3.date_start, first_wo.date_start)
        self.assertLess(first_wo.date_start, datetime(2027, 3, 1, 9), "Planned as soon as possible")

    @freeze_time('2027-03-01 06:30:00')
    def test_workorders_sorted_by_production_start(self):
        """ The work order kanban sorts the work orders by the start of their MOs. """
        self.env.user.group_ids += self.env.ref('mrp.group_mrp_routings')
        mos = self.env['mrp.production'].create([{
            'product_id': self.product_5.id, 'bom_id': self.bom_2.id, 'product_qty': 1,
            'date_deadline': datetime(2027, 3, 10 + i, 12),
        } for i in range(2)])
        mos.action_confirm()
        kanban_order = self.env.ref('mrp.workcenter_line_kanban').sudo().arch_db.split('default_order="')[1].split('"')[0]

        def workorders():
            return self.env['mrp.workorder'].search([('production_id', 'in', mos.ids)], order=kanban_order)

        self.assertEqual(workorders().production_id, mos[0] | mos[1])
        self.assertEqual(mos[0].workorder_ids.production_date_start, mos[0].date_start)
        # reordering the MOs reschedules them: their work orders follow
        (mos[1] | mos[0]).web_resequence({'sequence': {}})
        self.assertLess(mos[1].date_start, mos[0].date_start)
        self.assertEqual(workorders().production_id, mos[1] | mos[0])
