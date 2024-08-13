# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime, timedelta
from freezegun import freeze_time

from odoo.tests import HttpCase, tagged, new_test_user
from ..models.bus_presence import PRESENCE_OUTDATED_TIMER


@tagged("-at_install", "post_install")
class TestBusPresence(HttpCase):
    def test_bus_presence_auto_vacuum(self):
        user = new_test_user(self.env, login="bob_user")
        # presence is outdated
        more_than_away_timer_ago = datetime.now() - timedelta(seconds=PRESENCE_OUTDATED_TIMER + 1)
        more_than_away_timer_ago = more_than_away_timer_ago.replace(microsecond=0)
        with freeze_time(more_than_away_timer_ago):
            self.env["bus.presence"]._update_presence(
                inactivity_period=0, identity_field="user_id", identity_value=user.id
            )
        presence = self.env["bus.presence"].search([("user_id", "=", user.id)])
        self.assertEqual(presence.last_poll, more_than_away_timer_ago)
        self.env["bus.presence"]._gc_bus_presence()
        presence = self.env["bus.presence"].search([("user_id", "=", user.id)])
        self.assertFalse(presence)
        # user is not active anymore
        self.env["bus.presence"]._update_presence(
            inactivity_period=0, identity_field="user_id", identity_value=user.id
        )
        presence = self.env["bus.presence"].search([("user_id", "=", user.id)])
        self.assertTrue(presence)
        user.active = False
        self.env["bus.presence"]._gc_bus_presence()
        presence = self.env["bus.presence"].search([("user_id", "=", user.id)])
        self.assertFalse(presence)
        # presence is offline
        self.env["bus.presence"]._update_presence(
            inactivity_period=0, identity_field="user_id", identity_value=user.id
        )
        presence = self.env["bus.presence"].search([("user_id", "=", user.id)])
        presence.status = "offline"
        self.assertEqual(presence.status, "offline")
        self.env["bus.presence"]._gc_bus_presence()
        presence = self.env["bus.presence"].search([("user_id", "=", user.id)])
        self.assertFalse(presence)
