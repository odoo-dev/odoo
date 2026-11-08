# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timezone

from odoo import Command
from odoo.exceptions import UserError
from odoo.tests import Form

from odoo.addons.mrp.tests.common import TestMrpCommon


class TestProductionWorkcenters(TestMrpCommon):

    def _workcenters(self, production):
        return [(wo.name, wo.workcenter_id) for wo in production.workorder_ids]

    def test_confirm_creates_default_workorder(self):
        production, bom = self.generate_mo()[:2]  # BoM without operations
        # at the first work center of all
        first_workcenter = self.env['mrp.workcenter'].search([('company_id', 'in', (production.company_id.id, False))], limit=1)
        self.assertEqual(len(production.workorder_ids), 1)
        self.assertEqual(production.workorder_ids.workcenter_id, first_workcenter)
        self.assertEqual(production.workcenter_ids, first_workcenter)

        # at the first work center of the manufacturing line
        self.workcenter_2.sudo().sequence, self.workcenter_3.sudo().sequence = 5, 2
        line = self.env['mrp.manufacturing.line'].sudo().create({
            'name': 'Line', 'workcenter_ids': [Command.set((self.workcenter_2 | self.workcenter_3).ids)],
        })
        production_2 = self.env['mrp.production'].create({
            'product_id': production.product_id.id, 'bom_id': bom.id, 'manufacturing_line_id': line.id,
        })
        production_2.action_confirm()
        self.assertEqual(production_2.workorder_ids.workcenter_id, self.workcenter_3)

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
        workorder.workcenter_id = False  # as a work order created without work center

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
        key = str(workorder.workcenter_id.id)
        self.assertEqual(production.workcenter_states[key]['ids'], workorder.ids)
        self.assertEqual(production.workcenter_states[key]['state'], 'ready')
        workorder.set_state('progress')
        self.assertEqual(production.workcenter_states[key]['state'], 'progress')
        self.assertEqual(len(production.workcenter_states[key]['users']), 1)
        workorder.set_state('ready')
        self.assertFalse(production.workcenter_states[key]['users'])

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

    def test_operation_workcenters(self):
        """ An operation is performed at its work center, or at one of its alternative
        work centers when the manufacturing line of the order requires it. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({
                    'name': 'Weld',
                    'workcenter_id': self.workcenter_3.id,
                    'workcenter_ids': [Command.set(self.workcenter_2.ids)],
                }),
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id}),
            ],
        })
        weld, cut = bom.operation_ids
        self.assertEqual(weld.workcenter_id, self.workcenter_3, "a regular field, not computed from the alternatives")
        self.assertEqual(weld._get_possible_workcenters(), self.workcenter_3 | self.workcenter_2)
        self.assertFalse(cut.workcenter_ids, "no alternative work center by default")
        self.assertEqual(weld._get_workcenter(), self.workcenter_3, "the work center without line")

        line = self.env['mrp.manufacturing.line'].sudo().create({
            'name': 'Line', 'workcenter_ids': [Command.set((self.workcenter_1 | self.workcenter_2).ids)],
        })
        bom.manufacturing_line_id = line
        self.assertFalse(weld.is_outside_manufacturing_line, "its alternative work center is in the line")
        self.assertFalse(cut.is_outside_manufacturing_line)
        weld.workcenter_ids = False
        self.assertTrue(weld.is_outside_manufacturing_line, "none of its work centers is in the line")
        weld.workcenter_ids = self.workcenter_2

        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        self.assertEqual(production.manufacturing_line_id, line, "the line of the BoM")
        production.action_confirm()
        self.assertEqual(production.workorder_ids.operation_id, weld)
        self.assertEqual(production.workorder_ids.workcenter_id, self.workcenter_2, "the alternative work center in the line")

    def test_link_operation_by_workcenter(self):
        """ A work order created at a work center gets the next operation of the
        BoM performed there. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'sequence': 2}),
                Command.create({'name': 'Polish', 'workcenter_id': self.workcenter_2.id, 'sequence': 3}),
            ],
        })
        cut, weld, polish = bom.operation_ids
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        production.action_confirm()
        self.assertEqual(production.workorder_ids.operation_id, cut)

        # moved to the second work center (kanban): its first operation there
        production.workcenter_ids = [Command.link(self.workcenter_2.id)]
        workorder = production.workorder_ids.filtered(lambda wo: wo.workcenter_id == self.workcenter_2)
        self.assertEqual(workorder.operation_id, weld)
        self.assertEqual(workorder.name, 'Weld')

        # another work order there: the next operation there
        other = self.env['mrp.workorder'].create({
            'name': 'Extra', 'production_id': production.id,
            'workcenter_id': self.workcenter_2.id, 'uom_id': production.uom_id.id,
        })
        self.assertEqual(other.operation_id, polish)
        self.assertEqual(other.name, 'Extra', "a given name is kept")

    def test_is_operations_done(self):
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'sequence': 2}),
            ],
        })
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        production.action_confirm()
        self.assertFalse(production.is_operations_done)
        production.workorder_ids.button_finish()
        self.assertFalse(production.is_operations_done, "the second operation is still to do")
        production.workorder_ids.filtered(lambda wo: wo.state != 'done').button_finish()
        self.assertTrue(production.is_operations_done)

    def test_activate_workcenters_no_cycle(self):
        """ Activating work centers in any order never makes the chain of work
        orders loop (the first work order used to keep its former dependency). """
        production = self.generate_mo()[0]
        first = production.workorder_ids
        production.workcenter_ids = [Command.link(self.workcenter_2.id)]
        second = production.workorder_ids - first
        self.assertEqual(second.blocked_by_workorder_ids, first)

        # the new work order now comes first: the chain is rebuilt the other way
        second.sequence = first.sequence - 1
        production._link_workorders_and_moves()
        self.assertEqual(first.blocked_by_workorder_ids, second)
        self.assertFalse(second.blocked_by_workorder_ids)

        # and activating more work centers keeps working
        production.workcenter_ids = [Command.link(self.workcenter_3.id), Command.link(self.workcenter_1.id)]
        self.assertTrue(production.workcenter_ids >= self.workcenter_3)

    def test_done_operations_stay_at_last_workcenter(self):
        """ A production whose operations are all done stays in the column of
        its last work center (green in the kanban) until it is closed. """
        production = self.generate_mo()[0]
        workorder = production.workorder_ids
        workcenter = workorder.workcenter_id
        workorder.button_finish()
        self.assertTrue(production.is_operations_done)
        self.assertEqual(production.workcenter_ids, workcenter)
        production.qty_producing = production.product_qty
        production.move_raw_ids.picked = True
        production.with_context(skip_consumption=True).button_mark_done()
        self.assertEqual(production.state, 'done')
        production.invalidate_recordset(['workcenter_ids'])
        self.assertFalse(production.workcenter_ids)

    def test_allowed_workcenters_include_active_ones(self):
        """ The work centers statusbar of the MO shows the ones of its line, plus
        the ones it is at outside of the line. """
        line = self.env['mrp.manufacturing.line'].sudo().create({
            'name': 'Line', 'workcenter_ids': [Command.set((self.workcenter_1 | self.workcenter_2).ids)],
        })
        production = self.generate_mo()[0]
        production.manufacturing_line_id = line
        self.assertEqual(production.allowed_workcenter_ids, (line.workcenter_ids | production.workcenter_ids).sorted())
        production.workcenter_ids = [Command.link(self.workcenter_3.id)]
        self.assertIn(self.workcenter_3, production.allowed_workcenter_ids)
        production.workcenter_ids = [Command.unlink(self.workcenter_3.id)]
        self.assertNotIn(self.workcenter_3, production.allowed_workcenter_ids, "not in the line nor active anymore")

    def test_next_operation_after_workorder_without_operation(self):
        """ When the production has nothing left to process, finishing a work order
        (even one without operation) creates the first operation without work order. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'sequence': 2}),
            ],
        })
        cut, weld = bom.operation_ids
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        production.action_confirm()
        production.workorder_ids.button_finish()
        production.workorder_ids.filtered(lambda wo: wo.operation_id == weld).unlink()
        self.assertEqual(production.workorder_ids.operation_id, cut)

        # a work order without operation, while nothing else is left to process
        manual = self.env['mrp.workorder'].create({
            'name': 'Manual', 'production_id': production.id,
            'workcenter_id': self.workcenter_3.id, 'uom_id': production.uom_id.id,
        })
        self.assertFalse(manual.operation_id)
        manual.button_finish()
        self.assertEqual(production.workorder_ids.operation_id, cut | weld, "the production goes on")

        # another work order still to process: nothing is created ahead of time
        production_2 = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id})
        production_2.action_confirm()
        manual_2 = self.env['mrp.workorder'].create({
            'name': 'Manual', 'production_id': production_2.id,
            'workcenter_id': self.workcenter_3.id, 'uom_id': production_2.uom_id.id,
        })
        manual_2.button_finish()
        self.assertEqual(production_2.workorder_ids.operation_id, cut, "Cut is still to process")

    def test_wc_sequence(self):
        """ Productions are ordered in the queue of each work center (the kanban
        columns) independently, the position being stored on their work orders. """
        productions = self.env['mrp.production']
        for _i in range(3):
            production = self.generate_mo()[0]
            production.workcenter_ids = [Command.link(self.workcenter_1.id), Command.link(self.workcenter_2.id)]
            productions |= production
        p1, p2, p3 = productions
        Production = self.env['mrp.production']
        wc1 = Production.with_context(default_workcenter_ids=[self.workcenter_1.id])
        wc2 = Production.with_context(default_workcenter_ids=[self.workcenter_2.id])

        # reorder each column as the kanban does (web_resequence in the column's context)
        wc1.browse((p3 | p1 | p2).ids).web_resequence({}, 'wc_sequence')
        wc2.browse((p2 | p3 | p1).ids).web_resequence({}, 'wc_sequence')
        self.assertEqual(p3.workorder_ids.filtered(lambda wo: wo.workcenter_id == self.workcenter_1).wc_sequence, 0)
        self.assertEqual(p3.workorder_ids.filtered(lambda wo: wo.workcenter_id == self.workcenter_2).wc_sequence, 1)

        domain = [('id', 'in', productions.ids)]
        self.assertEqual(wc1.search(domain + [('workcenter_ids', '=', self.workcenter_1.id)], order='wc_sequence, id'), p3 | p1 | p2)
        self.assertEqual(wc2.search(domain + [('workcenter_ids', '=', self.workcenter_2.id)], order='wc_sequence, id'), p2 | p3 | p1)
        self.assertEqual(wc1.browse(p1.id).wc_sequence, 1)
        self.assertEqual(wc2.browse(p1.id).wc_sequence, 2)

        # a production arriving in a column without position goes last
        p4 = self.generate_mo()[0]
        p4.workcenter_ids = [Command.link(self.workcenter_1.id)]
        self.assertEqual(
            wc1.search([('id', 'in', (productions | p4).ids), ('workcenter_ids', '=', self.workcenter_1.id)], order='wc_sequence, id'),
            p3 | p1 | p2 | p4)

    def test_workorder_analysis(self):
        """ The work orders analysis also counts the operations without work order yet. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1, 'time_mode': 'manual', 'time_cycle_manual': 30}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'sequence': 2, 'time_mode': 'manual', 'time_cycle_manual': 45}),
            ],
        })
        cut, weld = bom.operation_ids
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id, 'product_qty': 2})
        production.action_confirm()
        self.assertEqual(production.workorder_ids.operation_id, cut)

        lines = self.env['mrp.workorder.analysis'].search([('production_id', '=', production.id)])
        self.assertRecordValues(lines.sorted(lambda line: line.operation_id.sequence), [
            {'operation_id': cut.id, 'workorder_id': production.workorder_ids.id, 'state': 'ready',
             'workcenter_id': self.workcenter_1.id},
            {'operation_id': weld.id, 'workorder_id': False, 'state': 'upcoming',
             'workcenter_id': self.workcenter_2.id},
        ])
        upcoming = lines.filtered(lambda line: line.state == 'upcoming')
        self.assertGreater(upcoming.duration_expected, 0)

        # once its work order exists, the operation is no longer upcoming (and the
        # done work orders are left out)
        production.workorder_ids.button_finish()
        self.env['mrp.workorder.analysis'].invalidate_model()  # a SQL view
        lines = self.env['mrp.workorder.analysis'].search([('production_id', '=', production.id)])
        self.assertRecordValues(lines, [{'operation_id': weld.id, 'state': 'ready'}])

    def test_workorder_analysis_planning(self):
        """ The upcoming operations are scheduled one after the other, after the
        work orders of their order, in the working hours of their work center. """
        calendar = self.env['resource.calendar'].sudo().create({
            'name': 'Mon-Fri 8-12 13-17',
            'attendance_ids': [
                Command.create({'dayofweek': str(day), 'hour_from': hour_from, 'hour_to': hour_to})
                for day in range(5) for hour_from, hour_to in [(8, 12), (13, 17)]
            ],
        })
        workcenter_a, workcenter_b = self.env['mrp.workcenter'].sudo().create([
            {'name': name, 'resource_calendar_id': calendar.id, 'time_start': 0, 'time_stop': 0, 'time_efficiency': 100}
            for name in ('Planning A', 'Planning B')
        ])
        (workcenter_a | workcenter_b).resource_id.tz = 'UTC'
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': workcenter_a.id, 'sequence': 1, 'time_mode': 'manual', 'time_cycle_manual': 60}),
                Command.create({'name': 'Weld', 'workcenter_id': workcenter_b.id, 'sequence': 2, 'time_mode': 'manual', 'time_cycle_manual': 300}),
                Command.create({'name': 'Pack', 'workcenter_id': workcenter_a.id, 'sequence': 3, 'time_mode': 'manual', 'time_cycle_manual': 30}),
            ],
        })
        # a time off of the work center B on the first afternoon
        self.env['resource.calendar.leaves'].sudo().create({
            'name': 'Maintenance', 'calendar_id': calendar.id, 'resource_id': workcenter_b.resource_id.id,
            'date_from': datetime(2030, 1, 7, 13), 'date_to': datetime(2030, 1, 7, 14),
        })
        # Monday January 7th, 2030, before the working hours
        production = self.env['mrp.production'].create({
            'product_id': self.product_4.id, 'bom_id': bom.id, 'product_qty': 1,
            'date_start': datetime(2030, 1, 7, 7),
        })
        production.action_confirm()
        cut = production.workorder_ids
        self.assertEqual(cut.duration_expected, 60)
        self.assertFalse(cut.date_finished, "not planned")

        Analysis = self.env['mrp.workorder.analysis']
        Analysis.invalidate_model()
        upcoming = Analysis.search([('production_id', '=', production.id), ('state', '=', 'upcoming')], order='date_start')
        # Cut (unplanned) takes 8:00-9:00; Weld 9:00-12:00 then 14:00-16:00 (time off); Pack 16:00-16:30
        self.assertRecordValues(upcoming, [
            {'name': 'Weld', 'date_start': datetime(2030, 1, 7, 9), 'date_finished': datetime(2030, 1, 7, 16)},
            {'name': 'Pack', 'date_start': datetime(2030, 1, 7, 16), 'date_finished': datetime(2030, 1, 7, 16, 30)},
        ])

        # planned work orders: the upcoming ones come after them, across the weekend
        cut.write({'date_start': datetime(2030, 1, 11, 15), 'date_finished': datetime(2030, 1, 11, 16)})
        Analysis.invalidate_model()
        upcoming = Analysis.search([('production_id', '=', production.id), ('state', '=', 'upcoming')], order='date_start')
        # Weld: Friday 16:00-17:00, then Monday 8:00-12:00; Pack: Monday 13:00-13:30
        self.assertRecordValues(upcoming, [
            {'name': 'Weld', 'date_start': datetime(2030, 1, 11, 16), 'date_finished': datetime(2030, 1, 14, 12)},
            {'name': 'Pack', 'date_start': datetime(2030, 1, 14, 13), 'date_finished': datetime(2030, 1, 14, 13, 30)},
        ])
        # as the calendar plans it
        self.assertEqual(
            calendar.plan_hours(5, datetime(2030, 1, 11, 16, tzinfo=timezone.utc)).replace(tzinfo=None),
            datetime(2030, 1, 14, 12))
        # searchable by date, as the Gantt view does
        self.assertEqual(
            Analysis.search([('production_id', '=', production.id), ('date_start', '>=', datetime(2030, 1, 14))]).mapped('name'),
            ['Pack'])

    def test_workorder_analysis_move(self):
        """ Moving a line of the planning moves its work order, not the upcoming ones. """
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1, 'time_mode': 'manual', 'time_cycle_manual': 30}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'sequence': 2, 'time_mode': 'manual', 'time_cycle_manual': 45}),
            ],
        })
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id, 'product_qty': 1})
        production.action_confirm()
        lines = self.env['mrp.workorder.analysis'].search([('production_id', '=', production.id)])
        line = lines.filtered('workorder_id')
        upcoming = lines - line

        line.write({
            'date_start': datetime(2030, 1, 7, 10), 'date_finished': datetime(2030, 1, 7, 11),
            'workcenter_id': self.workcenter_2.id,
        })
        workorder = production.workorder_ids
        self.assertRecordValues(workorder, [{'date_start': datetime(2030, 1, 7, 10), 'workcenter_id': self.workcenter_2.id}])
        self.assertRecordValues(line, [{
            'date_start': workorder.date_start, 'date_finished': workorder.date_finished, 'workcenter_id': self.workcenter_2.id,
        }])
        with self.assertRaises(UserError):
            upcoming.write({'date_start': datetime(2030, 1, 8, 10), 'date_finished': datetime(2030, 1, 8, 11)})
        with self.assertRaises(UserError):
            line.write({'name': 'Renamed'})

    def test_manual_workorder_operation(self):
        """ A work order added by hand is linked to the next operation without work
        order that can be performed at its work center (main or alternative one):
        it gets its name and duration, and is no longer an upcoming operation. """
        workcenter_3, workcenter_4 = self.env['mrp.workcenter'].sudo().create([
            {'name': 'Alternative Welder'}, {'name': 'Unrelated'},
        ])
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'operation_ids': [
                Command.create({'name': 'Cut', 'workcenter_id': self.workcenter_1.id, 'sequence': 1, 'time_mode': 'manual', 'time_cycle_manual': 30}),
                Command.create({'name': 'Weld', 'workcenter_id': self.workcenter_2.id, 'workcenter_ids': [Command.link(workcenter_3.id)],
                                'sequence': 2, 'time_mode': 'manual', 'time_cycle_manual': 45}),
            ],
        })
        cut, weld = bom.operation_ids
        production = self.env['mrp.production'].create({'product_id': self.product_4.id, 'bom_id': bom.id, 'product_qty': 1})
        production.action_confirm()
        self.assertEqual(production.workorder_ids.operation_id, cut)

        # at a work center of no operation (left): not linked
        with Form(production) as mo_form:
            with mo_form.workorder_ids.new() as wo_form:
                wo_form.name = 'Extra check'
                wo_form.workcenter_id = workcenter_4
        extra = production.workorder_ids.filtered(lambda wo: wo.name == 'Extra check')
        self.assertFalse(extra.operation_id)

        # at the alternative work center of Weld: it is the Weld work order
        with Form(production) as mo_form:
            with mo_form.workorder_ids.new() as wo_form:
                wo_form.name = 'Weld by hand'
                wo_form.workcenter_id = workcenter_3
        manual = production.workorder_ids.filtered(lambda wo: wo.workcenter_id == workcenter_3)
        self.assertEqual(manual.operation_id, weld)
        self.assertEqual(manual.duration_expected, manual._get_duration_expected())
        upcoming = self.env['mrp.workorder.analysis'].search([('production_id', '=', production.id), ('state', '=', 'upcoming')])
        self.assertFalse(upcoming, "Weld has its work order")

        # moving the extra one to the work center of Cut: Cut has its work order already
        extra.workcenter_id = self.workcenter_1
        self.assertFalse(extra.operation_id)

    def test_workcenter_states_remaining_time(self):
        """ The kanban columns sum the remaining time of the productions at their
        work center only, given by work center in `workcenter_states`. """
        production = self.generate_mo()[0]
        production.workcenter_ids = [Command.link(self.workcenter_1.id), Command.link(self.workcenter_2.id)]
        wo_1 = production.workorder_ids.filtered(lambda wo: wo.workcenter_id == self.workcenter_1)
        wo_2 = production.workorder_ids.filtered(lambda wo: wo.workcenter_id == self.workcenter_2)
        wo_1.duration_expected = 60
        wo_2.duration_expected = 30
        production.invalidate_recordset(['workcenter_states'])
        states = production.workcenter_states
        self.assertEqual(states[str(self.workcenter_1.id)]['remaining_time'], sum(wo_1.mapped('remaining_time')))
        self.assertEqual(states[str(self.workcenter_2.id)]['remaining_time'], 30)
