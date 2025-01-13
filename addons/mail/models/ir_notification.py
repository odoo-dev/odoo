from datetime import timedelta

from odoo import api, models, fields
from odoo.tools import SQL


class IrNotification(models.Model):
    """ This model will be used to send notifications by email. It will prevent
        spam by acting as a buffer. When the number of emails sent to a user
        exceeds a certain threshold, the system will delay the notifications
        and try to merge them within the same email. This should help reduce
        the number of email sent.

        To create a new notification, you just have to create a new record using
        this model. The model and the cron job will handle the rest. """

    _name = "ir.notification"
    _description = "Ir Notification"

    email_layout_xmlid = fields.Text("Mail Template XML ID", required=True)
    partner_id = fields.Many2one("res.partner", required=True)
    res_model = fields.Char("Related Document Model", required=True)
    res_id = fields.Integer("Related Document ID", required=True)
    status = fields.Selection([
        ("pending", "Pending"),
        ("merged", "Merged"),
        ("sent", "Sent")
    ], default="pending")
    date_sent = fields.Datetime("Sent date")

    def _process_notification_queue(self):
        # When processing the queue, we will consider each partner having pending
        # notifications individually. This should make the code easier to understand
        # and should also ensure that we don't deal with too large recordsets.
        self.env.cr.execute(SQL('''
            SELECT DISTINCT partner_id
              FROM ir_notification
             WHERE status = 'pending';
        '''))
        rows = self.env.cr.dictfetchall()
        for row in rows:
            self._process_notification_queue_for_partner(row['partner_id'])

    def _process_notification_queue_for_partner(self, partner_id):
        # Before sending notifications, we will count the number of notifications
        # sent to the given partner over the x last minutes.

        threshold = 5
        number_of_notifications_sent = 0
        now = fields.Datetime.now()

        all_notifications_to_partner = list(
            self.search([('partner_id', '=', partner_id)], order='create_date ASC'))

        for notification in all_notifications_to_partner:
            if notification.status == 'sent' \
                and notification.date_sent \
                and notification.date_sent < now \
                and notification.date_sent > now - timedelta(minutes=5):
                number_of_notifications_sent += 1
            if number_of_notifications_sent > threshold:
                # When the number of notifications sent to the partner is larger
                # than our threshold, we exit the function and don't send anything
                # to prevent spam. The notifications are kept in the queue and
                # should eventually be sent when re-processing the queue later.
                return

        # If we get here, it means that we can send notifications to the partner.
        # To minimize the number of notifications, we will fetch the oldest
        # notifications to send and fetch from the queue all the other pending
        # notifications that can be merged with it.

        i = 0
        while i < len(all_notifications_to_partner) and number_of_notifications_sent < threshold:
            if all_notifications_to_partner[i].status != 'pending':
                i += 1
                continue

            # Here, we will accumulate all the pending notifications j that can
            # be merged with the pending notification i.

            notifications_to_merge = self.env['ir.notification']
            j = i + 1

            while j < len(all_notifications_to_partner):
                can_merge_notifications = all_notifications_to_partner[j].status == 'pending' \
                    and all_notifications_to_partner[i].email_layout_xmlid == all_notifications_to_partner[j].email_layout_xmlid \
                    and all_notifications_to_partner[i].res_model == all_notifications_to_partner[j].res_model
                if can_merge_notifications:
                    notifications_to_merge += all_notifications_to_partner[j]
                j += 1

            # Then, we send a new notification to the partner.
            batch_of_notifications_to_send = all_notifications_to_partner[i] + notifications_to_merge
            batch_of_notifications_to_send._send_notifications()

            # Then, we need to update the flags of the selected notifications to prevent future selection.
            all_notifications_to_partner[i].write({'status': 'sent'})
            if notifications_to_merge:
                notifications_to_merge.write({'status': 'merged'})

            # Finally, we increment the number of notification sent to prevent spam.
            number_of_notifications_sent += 1

    def _send_notifications(self):
        """ Send a notification immediately for all the records of the recorsets."""
        if not self:
            return

        res_model = self.mapped('res_model')[0]
        res_ids = self.mapped('res_id')
        records = self.env[res_model].browse(res_ids)

        mail_values = {
            'subject': 'Test Email Subject',
            'body_html': self.env['ir.qweb']._render('mail.ir_notification', {
                'records': records
            }),
            'email_to': 'recipient@example.com',
            'email_from': 'sender@example.com'
        }

        mail = self.env['mail.mail'].create(mail_values)
        mail.send()

        self.write({
            "date_sent": fields.Datetime.now()
        })

    @api.autovacuum
    def _gc_notifications_sent(self):
        self.search([
            ("status", "!=", "pending"),
            ("create_date", "<=", fields.Datetime.now() - timedelta(minutes=5))
        ]).unlink()
