# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.event.tests.common import TestEventCommon
from odoo.tests import Form


class TestWebsiteEventMeet(TestEventCommon):
    def test_meeting_room_form(self):
        """Test that the field of the mixin are automatically filled."""
        new_meeting_room_form = Form(self.env["event.meeting.room"])
        new_meeting_room_form.name = "Test name"
        new_meeting_room_form.event_id = self.event_0
        new_meeting_room_form.target_audience = "dev"
        new_meeting_room_form.room_max_capacity = "20"
        meeting_room = new_meeting_room_form.save()

        self.assertTrue(meeting_room.chat_room_id)
        self.assertEqual(meeting_room.chat_room_id.max_capacity, "20")

    def test_meeting_room_copy(self):
        """Test the duplication of the meeting room."""
        meeting_room_1 = self.env["event.meeting.room"].create({
            "name": "Test meeting room",
            "event_id": self.event_0.id,
            "target_audience": "dev",
            "room_max_capacity": "20",
        })

        meeting_room_2 = meeting_room_1.copy()

        chat_room_1 = meeting_room_1.chat_room_id
        chat_room_2 = meeting_room_2.chat_room_id

        self.assertTrue(chat_room_1)
        self.assertTrue(chat_room_2)
        self.assertNotEqual(chat_room_1.id, chat_room_2.id, "Must create a new chat room")
        self.assertNotEqual(chat_room_1.name, chat_room_2.name, "Must generate a new chat room name")
        self.assertEqual(chat_room_1.max_capacity, "20", "Must set the max capacity on the chat room")
        self.assertEqual(chat_room_2.max_capacity, "20", "Must copy the max capacity")

    def test_meeting_room_unlink(self):
        """Test the duplication of the meeting room."""
        meeting_room = self.env["event.meeting.room"].create({
            "name": "Test meeting room",
            "event_id": self.event_0.id,
            "target_audience": "dev",
            "room_max_capacity": "20",
        })

        self.assertTrue(meeting_room.chat_room_id)
        chat_room_id = meeting_room.chat_room_id.id

        meeting_room.unlink()
        self.assertFalse(self.env["chat.room"].browse(chat_room_id).exists())
