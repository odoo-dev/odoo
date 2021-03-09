# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from lxml import objectify
from werkzeug import urls

from odoo.tests.common import TransactionCase

_logger = logging.getLogger(__name__)


class PaymentTestUtils(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.base_url = cls.env['ir.config_parameter'].get_param('web.base.url')
        cls.db_secret = cls.env['ir.config_parameter'].get_param('database.secret')

    def _build_url(self, route):
        return urls.url_join(self.base_url, route)

    def _extract_values_from_html_form(self, html_form):
        """ Extract the transaction rendering values from an HTML form.

        :param str html_form: The HTML form
        :return: The extracted information (action & inputs)
        :rtype: dict[str:str]
        """
        html_tree = objectify.fromstring(html_form)
        action = html_tree.get('action')
        inputs = {form_input.get('name'): form_input.get('value') for form_input in html_tree.input}
        return {
            'action': action,
            'inputs': inputs,
        }
