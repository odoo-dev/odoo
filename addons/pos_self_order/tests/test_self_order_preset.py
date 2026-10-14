import odoo.tests
from odoo.addons.pos_self_order.tests.self_order_common_test import SelfOrderPresetCommonTest


@odoo.tests.tagged('post_install', '-at_install')
class TestSelfOrderPreset(SelfOrderPresetCommonTest):
    def test_preset_takeaway_tour(self):
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, "")
        order = self.process_self_order(
            [{'product': self.cola, 'qty': 1, 'price_unit': self.cola.lst_price}],
            preset=self.preset_takeaway,
            floating_order_name='Dr Dre',
        )
        self.assertEqual("Dr Dre", order.floating_order_name)

    def test_preset_with_slot_tour(self):
        resource_calendar = self.env['resource.calendar'].create({
            'name': 'Takeaway',
            'attendance_ids': [(0, 0, {
                'dayofweek': str(day),
                'hour_from': 0,
                'hour_to': 24,
            }) for day in range(0, 6)],
        })
        self.preset_takeaway.write({
            'use_timing': True,
            'resource_calendar_id': resource_calendar,
            'interval_time': 20,
        })
        self.pos_config.with_user(self.pos_user).open_ui()
        self.pos_config.current_session_id.set_opening_control(0, "")
        self_route = self.pos_config._get_self_order_route()
        self.start_tour(self_route, "self_order_preset_slot_tour")
        last_order = self.env["pos.order"].search([], limit=1, order="id desc")
        self.assertEqual(last_order.floating_order_name, 'Dr Dre')
        self.assertNotEqual(last_order.preset_time, False)
