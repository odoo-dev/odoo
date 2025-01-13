from odoo.addons.mail.tests.common import MailCommon


class TestIrNotification(MailCommon):
    def test_ir_notification(self):
        """
        Check that the system creates notifications and prevents spamming the user.
        see: addons/test_mail/tests/test_mail_followers.py
        """

        partner = self.env['res.partner'].create({
            "name": "julien",
            "email": "julien@test.mycompany.com"
        })
        notified_user = self.env['res.users'].create({
            'login': 'julien',
            'partner_id': partner.id,
            'notification_type': 'email',
        })

        tracks = self.env['mail.test.track'].with_user(self.user_employee).with_context({
            'default_state': 'done',
            'mail_notify_force_send': False
        }).create([{
            'name': f'Test {k}',
            'user_id': notified_user.id
        } for k in range(10)])

        # Check that the user is a follower of the thread:
        for track in tracks:
            self.assertEqual(track.message_partner_ids,
                self.user_employee.partner_id | notified_user.partner_id)

        # Check that it creates notifications:
        ir_notifications = self.env['ir.notification'].search([])
        self.assertEqual(len(ir_notifications), 10)

        for ir_notification, track in zip(ir_notifications, tracks):
            self.assertEqual(ir_notification.email_layout_xmlid, 'mail.message_user_assigned')
            self.assertEqual(ir_notification.partner_id, partner)
            self.assertEqual(ir_notification.res_id, track.id)
            self.assertEqual(ir_notification.res_model, track._name)
            self.assertEqual(ir_notification.status, 'pending')

        # Then, we call the method to process the notification queue:
        with self.mock_mail_gateway():
            self.env['ir.notification']._process_notification_queue()
            print("mail", self._new_mails)

            self.assertEqual(ir_notifications[0].status, 'sent')
            for k in range(1, 10):
                self.assertEqual(ir_notifications[k].status, 'merged')

        # # Then, we trigger the method to garbage collect the notifications:
        # now = datetime.now()
        # with freeze_time(now + timedelta(days=4)):
        #     self.env['ir.notification']._gc_notifications_sent()

