# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo.exceptions import UserError
from odoo.http import request

from odoo.addons.mail_plugin.controllers import mail_plugin

_logger = logging.getLogger(__name__)


class MailPluginController(mail_plugin.MailPluginController):

    def _get_contact_data(self, partner):
        """
        Overrides the base module's get_contact_data method by Adding the "tasks" key within the initial contact
        information dict loaded when opening an email on Outlook.
        This is structured this way to enable the "project" feature on the Outlook side only if the Odoo version
        supports it.
        """
        contact_values = super(MailPluginController, self)._get_contact_data(partner)
        if not partner:
            contact_values['tasks'] = []
        else:
            partner_tasks = request.env['project.task'].search(
                [('partner_id', '=', partner.id)], offset=0, limit=5)

            tasks_values = []

            for task in partner_tasks:
                task_values = {
                    'task_id': task.id,
                    'name': task.name,
                    'company_id': task.company_id
                }
                try:
                    task.project_id.check_access_rule('read')
                    task_values['project_name'] = task.project_id.name
                except UserError:
                    pass # user doesn't have access to the project name, we simply don't include it in the response

                tasks_values.append(task_values)

            contact_values['tasks'] = tasks_values

        return contact_values

    def _mail_content_logging_models_whitelist(self):
        return super(MailPluginController, self)._mail_content_logging_models_whitelist() + ['project.task']

    def _translation_modules_whitelist(self):
        return super(MailPluginController, self)._translation_modules_whitelist() + ['project_mail_plugin']
