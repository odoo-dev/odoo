# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.exceptions import UserError

from odoo.addons.mrp.tests.common import TestMrpCommon


class TestProductionWorkcenters(TestMrpCommon):

    def _workcenters(self, production):
        return [(wo.name, wo.workcenter_id) for wo in production.workorder_ids]

    def test_confirm_creates_workorder_without_workcenter(self):
        production = self.generate_mo()[0]  # BoM without operations
        self.assertEqual(len(production.workorder_ids), 1)
        self.assertFalse(production.workorder_ids.workcenter_id)
        self.assertFalse(production.workcenter_ids)

        # a production with operations keeps the work orders of its BoM
        production_2 = self.env['mrp.production'].create({
            'product_id': self.bom_2.product_id.id, 'bom_id': self.bom_2.id,
        })
        production_2.action_confirm()
        self.assertEqual(production_2.workorder_ids.operation_id, self.bom_2.operation_ids)
        self.assertEqual(production_2.workcenter_ids, self.bom_2.operation_ids.workcenter_id)

    def test_write_workcenter_ids(self):
        production = self.generate_mo()[0]
        workorder = production.workorder_ids

        # linking a work center gives it to the work order without work center
        production.workcenter_ids = [Command.link(self.workcenter_1.id)]
        self.assertEqual(workorder.workcenter_id, self.workcenter_1)
        self.assertEqual(production.workcenter_ids, self.workcenter_1)

        # moving from a work center to another one (kanban drag & drop): the work
        # order of the first one is stopped and done, a new one goes on
        workorder.button_start()
        production.write({'workcenter_ids': [Command.unlink(self.workcenter_1.id), Command.link(self.workcenter_2.id)]})
        self.assertEqual(workorder.state, 'done')
        self.assertFalse(workorder.time_ids.filtered(lambda t: not t.date_end), "timers are stopped")
        new_workorder = production.workorder_ids - workorder
        self.assertEqual(new_workorder.workcenter_id, self.workcenter_2)
        self.assertEqual(new_workorder.state, 'ready')
        self.assertEqual(production.workcenter_ids, self.workcenter_2)

        # moving back to the first work center reopens its work order
        production.write({'workcenter_ids': [Command.unlink(self.workcenter_2.id), Command.link(self.workcenter_1.id)]})
        self.assertEqual(workorder.state, 'ready')
        self.assertEqual(new_workorder.state, 'done')
        self.assertEqual(len(production.workorder_ids), 2)
        self.assertEqual(production.workcenter_ids, self.workcenter_1)

        # linking another work center creates a work order
        production.workcenter_ids = [Command.link(self.workcenter_3.id)]
        self.assertEqual(len(production.workorder_ids), 3)
        self.assertEqual(production.workcenter_ids, self.workcenter_1 | self.workcenter_3)

        # moving out of all work centers leaves a work order without work center
        production.workcenter_ids = [Command.clear()]
        self.assertFalse(production.workcenter_ids)
        self.assertEqual(production.workorder_ids.filtered(lambda wo: wo.state != 'done').workcenter_id.ids, [])
        self.assertEqual(len(production.workorder_ids.filtered(lambda wo: wo.state != 'done')), 1)

        with self.assertRaises(UserError):
            production.workcenter_ids = [Command.create({'name': 'New'})]

    def test_group_by_workcenter_ids(self):
        production = self.env['mrp.production'].create({
            'product_id': self.bom_2.product_id.id, 'bom_id': self.bom_2.id,
        })
        production.action_confirm()
        # both operations of the BoM are on the same work center: count it once
        self.assertEqual(len(production.workorder_ids.workcenter_id), 1)
        groups = self.env['mrp.production'].with_context(read_group_expand=True).web_read_group(
            [('id', '=', production.id)], ['workcenter_ids'], ['__count'])['groups']
        counts = {group['workcenter_ids'] and group['workcenter_ids'][0]: group['__count'] for group in groups}
        self.assertEqual(counts[self.workcenter_1.id], 1)
        # every work center is a column, by sequence
        workcenters = self.env['mrp.workcenter'].search([])
        self.assertEqual([wc for wc in counts if wc], workcenters.ids)

        # from a manufacturing line: only its work centers
        line = self.env['mrp.manufacturing.line'].sudo().create({
            'name': 'Line', 'workcenter_ids': [Command.set((self.workcenter_1 | self.workcenter_2).ids)],
        })
        action = line.action_open_productions()
        groups = self.env['mrp.production'].with_context(read_group_expand=True, **action['context']).web_read_group(
            action['domain'], ['workcenter_ids'], ['__count'])['groups']
        self.assertEqual([group['workcenter_ids'][0] for group in groups], (self.workcenter_1 | self.workcenter_2).sorted().ids)
        self.assertEqual(line.production_count, 1)

        # the work centers a production can go to are the ones of its line
        production.manufacturing_line_id = line.id
        self.assertEqual(production.allowed_workcenter_ids, line.workcenter_ids)
        production.manufacturing_line_id = False
        self.assertEqual(production.allowed_workcenter_ids, workcenters)

    def test_workcenter_states(self):
        production = self.generate_mo()[0]
        workorder = production.workorder_ids
        self.assertEqual(production.workcenter_states, {'0': {'ids': workorder.ids, 'state': 'ready'}})
        workorder.set_state('progress')
        self.assertEqual(production.workcenter_states['0']['state'], 'progress')
        self.assertEqual(list(production.working_user_ids), ['0'])
        self.assertFalse(workorder.leave_id, "no global leave for a work order without work center")
        workorder.set_state('ready')
        self.assertFalse(production.working_user_ids)

    def test_next_operation_workorder(self):
        """ Only the first operation of the BoM gets its work order upfront, the
        next ones are created as the previous ones are done. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'sequence': 2}),
                Command.create({'name': 'Paint', 'workcenter_id': self.workcenter_3.id, 'sequence': 3}),
            ],
        })
        cut, weld, paint = bom.operation_ids
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        production.action_confirm()
        self.assertEqual(production.workorder_ids.operation_id, cut)

        production.workorder_ids.button_finish()
        self.assertEqual(production.workorder_ids.operation_id, cut | weld)
        self.assertEqual(production.workcenter_ids, self.workcenter_2)

        # through a kanban move: done at the second work center, on to the third
        production.workcenter_ids = [Command.unlink(self.workcenter_2.id), Command.link(self.workcenter_3.id)]
        self.assertEqual(production.workorder_ids.operation_id, cut | weld | paint)
        self.assertEqual(production.workcenter_ids, self.workcenter_3)
        self.assertEqual(len(production.workorder_ids), 3, "the next operation's work order took the move")

    def test_mo_overview_upcoming_operations(self):
        """ The MO overview estimates the operations without work order yet. """
        self.workcenter_2.sudo().costs_hour = 60
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'time_cycle_manual': 30, 'sequence': 1}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'time_cycle_manual': 30, 'sequence': 2}),
            ],
        })
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        production.action_confirm()
        self.assertEqual(len(production.workorder_ids), 1)

        operations = self.env['report.mrp.report_mo_overview'].get_report_values(production.id)['data']['operations']
        self.assertEqual([op['name'] for op in operations['details']], ['Cut', 'Weld'])
        upcoming = operations['details'][1]
        self.assertNotIn('id', upcoming)
        self.assertEqual(upcoming['formatted_state'], 'Upcoming')
        weld_duration = production._get_operation_duration_expected(bom.operation_ids[1])
        self.assertAlmostEqual(upcoming['quantity'], weld_duration)
        self.assertAlmostEqual(upcoming['mo_cost'], weld_duration / 60 * 60)
        self.assertAlmostEqual(
            operations['summary']['mo_cost'],
            sum(op['mo_cost'] for op in operations['details']), places=2)

        # once all the work orders exist, nothing is estimated anymore
        production.button_plan()
        operations = self.env['report.mrp.report_mo_overview'].get_report_values(production.id)['data']['operations']
        self.assertTrue(all(op.get('id') for op in operations['details']))
