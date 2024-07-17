# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta

from odoo import api, models, fields
from odoo.tools import groupby


class IrNotification(models.Model):
    _name = "ir.notification"
    _description = "Ir Notification"

    template = fields.Text("Mail template XML ID", required=True)
    partner_id = fields.Many2one("res.partner", required=True)
    res_model = fields.Char("Related Document Model", required=True)
    res_id = fields.Integer("Related Document ID", required=True)
    status = fields.Selection([("skipped", "Skipped"), ("sent", "Sent")])

    def create(self, vals_list):
        delta_time = timedelta(minutes=5)
        partner_ids = [vals["partner_id"] for vals in vals_list]
        notifications_grouped_by_partner = dict(groupby(self.search([
            ("partner_id", "in", partner_ids),
            ("create_date", ">=", fields.Datetime.now() - 2 * delta_time)
        ]), lambda notification: notification.partner_id.id))

        new_notification_to_skip = []
        new_notification_to_send = []

        for vals in vals_list:
            notifications = notifications_grouped_by_partner.get(vals["partner_id"], [])

            number_of_notifications_sent = 0
            for notification in notifications:
                if notification.status == "sent":
                    number_of_notifications_sent = number_of_notifications_sent + 1

            # TODO: Count the number of distinct templates sent to the partner?
            for new_notification in new_notification_to_send:
                if new_notification["partner_id"] == vals["partner_id"]:
                    number_of_notifications_sent = number_of_notifications_sent + 1

            if number_of_notifications_sent < 3:
                new_notification_to_send.append(vals)
            else:
                new_notification_to_skip.append(vals)

        notification_to_skip = super().create([{
            **new_notification,
            "status": "skipped"
        } for new_notification in new_notification_to_skip])
        notification_to_send = super().create([{
            **new_notification,
            "status": "sent"
        } for new_notification in new_notification_to_send])

        print('notification_to_skip', notification_to_skip)
        print('notification_to_send', notification_to_send)

        notification_to_send.send_notification_now()
        if notification_to_skip:
            self.schedule_cron_job()

        return notification_to_send + notification_to_skip

    def process_email_notification_queue(self):
        skipped_notifications_grouped_by_partner = dict(groupby(self.search([
            ("status", "=", "skipped")
        ]), lambda notification: notification.partner_id.id))

    def schedule_cron_job(self):
        """ Schedule a daemon cron job to send emails"""
        pass

    def send_notification_now(self):
        for (template, ir_notification) in self.grouped("template").items():
            for (res_model, ir_notification) in ir_notification.grouped("res_model").items():
                partner_ids = ir_notification.mapped("partner_id").ids
                records = self.env[res_model].search([("id", "in", ir_notification.mapped("res_id"))])
                records._message_auto_subscribe_notify(partner_ids, template)
                ir_notification.write({ "status": "sent" })

    @api.autovacuum
    def _gc_notifications_sent(self):
        self.search([
            ("create_date", "<=", fields.Datetime.now() - 2 * timedelta(minutes=5)),
            ("status", "=", "sent")
        ]).unlink()
