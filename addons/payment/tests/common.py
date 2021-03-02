# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from lxml import objectify
from werkzeug import urls

from odoo.tests.common import TransactionCase
from odoo.fields import Command

_logger = logging.getLogger(__name__)

class PaymentTestUtils(TransactionCase):
    """Utils shared by PaymentCommon & PaymentHttpCommon"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.base_url = cls.env['ir.config_parameter'].get_param('web.base.url')
        cls.db_secret = cls.env['ir.config_parameter'].get_param('database.secret')

    def build_url(self, uri):
        return urls.url_join(self.base_url, uri)

    def get_form_info(self, html_form):
        """Extract the information from an html_form

        NOTE: Can be used to extract information from the redirect_form
            specified in processing_values['redirect_form_html']

        NOTE': The returned values are all expressed as strings
            e.g. form_info['inputs']['amount'] = '1111.11'

        :param str html_form: stringified html form
        :returns: extracted information (action & inputs)
        :rtype: dict[str:str]
        """
        html_tree = objectify.fromstring(html_form)
        form_info = {'action': html_tree.get('action')}
        inputs = dict()
        for form_input in html_tree.input:
            inputs[form_input.get('name')] = form_input.get('value')
        form_info['inputs'] = inputs
        return form_info


class PaymentCommon(PaymentTestUtils):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.currency_euro = cls._prepare_currency('EUR')
        cls.currency_usd = cls._prepare_currency('USD')

        cls.country_belgium = cls.env.ref('base.be')
        cls.country_france = cls.env.ref('base.fr')
        cls.europe = cls.env.ref('base.europe')

        cls.group_portal = cls.env.ref('base.group_portal')
        cls.group_public = cls.env.ref('base.group_public')
        cls.group_user = cls.env.ref('base.group_user')

        cls.admin_user = cls.env.ref('base.user_admin')
        cls.internal_user = cls.env['res.users'].create({
            'name': 'Internal User (Test)',
            'login': 'internal',
            'password': 'internal',
            'groups_id': [Command.link(cls.group_user.id)]
        })
        cls.portal_user = cls.env['res.users'].create({
            'name': 'Portal User (Test)',
            'login': 'payment_portal',
            'password': 'payment_portal',
            'groups_id': [Command.link(cls.group_portal.id)]
        })

        cls.admin_partner = cls.admin_user.partner_id
        cls.internal_partner = cls.internal_user.partner_id
        cls.portal_partner = cls.portal_user.partner_id

        cls.default_partner = cls.env['res.partner'].create({
            'name': 'Norbert Buyer',
            'lang': 'en_US',
            'email': 'norbert.buyer@example.com',
            'street': 'Huge Street',
            'street2': '2/543',
            'phone': '0032 12 34 56 78',
            'city': 'Sin City',
            'zip': '1000',
            'country_id': cls.country_belgium.id,
        })

        # Create a dummy manual acquirer to enable basic tests without dependencies
        # on any specific acquirer implementation.
        cls.manual_acquirer = cls.env['payment.acquirer'].create({
            'provider': 'none',
            'state': 'enabled',
            'name': 'Manual Acquirer (Test)',
            'allow_tokenization': True,
        })
        arch = """
        <form action="dummy" method="post">
            <input type="hidden" name="view_id" t-att-value="viewid"/>
            <input type="hidden" name="user_id" t-att-value="user_id.id"/>
        </form>
        """
        cls.dummy_redirect_form = cls.env['ir.ui.view'].create({
            'name': 'dummy redirect form',
            'type': 'qweb',
            'arch': arch,
        })
        cls.manual_acquirer.redirect_form_view_id = cls.dummy_redirect_form

        # Example test values #
        # For a basic flow    #
        #######################
        cls.acquirer = cls.manual_acquirer
        cls.amount = 1111.11
        cls.company = cls.env.company
        cls.currency = cls.currency_euro
        cls.partner = cls.default_partner
        cls.reference = "Test Transaction"

    @classmethod
    def _prepare_currency(cls, code):
        currency = cls.env['res.currency'].with_context(active_test=False).search([
            ('name', '=', code.upper()),
        ])
        currency.action_unarchive()
        return currency

    @classmethod
    def _prepare_acquirer(cls, provider='none', company=None, values=None):
        """Find, update and return the first acquirer found for request provider & company

        Also disables the other acquirers to avoid any interferences.
        """
        company = company or cls.env.company
        values = values or {}

        acquirer = cls.env['payment.acquirer'].sudo().search([
            ('provider', '=', provider),
            ('company_id', '=', company.id),
        ], limit=1)
        if not acquirer:
            acquirer = cls.env['payment.acquirer'].sudo().search([
                ('provider', '=', provider),
            ], limit=1)
            if not acquirer:
                _logger.error("No payment.acquirer found for provider %s", provider)
                return acquirer
            # If no acquirer is found in given company
            #   Duplicate the one from the base company
            acquirer = acquirer.copy({'company_id': company.id})

        acquirer.write({
            'state': 'test',
            **values
        })
        return acquirer

    def create_transaction(self, flow, sudo=True, **values):
        default_values = {
            'amount': self.amount,
            'currency_id': self.currency.id,
            'acquirer_id': self.acquirer.id,
            'reference': self.reference,
            'operation': f'online_{flow}',
            'partner_id': self.partner.id,
        }
        return self.env['payment.transaction'].sudo(sudo).create(dict(default_values, **values))

    def create_token(self, sudo=True, **values):
        default_values = {
            'name': "XXXXXXXXXXXXXXX-2565 (TEST)",
            'acquirer_id': self.acquirer.id,
            'partner_id': self.partner.id,
            'acquirer_ref': "Acquirer Ref (TEST)",
        }
        return self.env['payment.token'].sudo(sudo).create(dict(default_values, **values))

    def _get_tx(self, reference):
        return self.env['payment.transaction'].sudo().search([
            ('reference', '=', reference),
        ])


class PaymentInvoicingCommon(PaymentCommon):


    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls._setup_acquirer_journal(cls.acquirer)

    @classmethod
    def _setup_acquirer_journal(cls, acquirer):
        """Add an adapted journal on the given acquirer."""
        if acquirer.journal_id:
            return

        acquirer.journal_id = cls.env['account.journal'].search([
            ('company_id', '=', acquirer.company_id.id),
            ('type', 'in', ['bank', 'cash']),
        ], limit=1).id

        cls.assertTrue(acquirer.journal_id, "No bank/cash journal found for company %s" % (acquirer.company_id.name))


class PaymentMultiCompanyCommon(PaymentCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company_a = cls.env.company
        cls.company_b = cls.env['res.company'].create({
            'name': "Odoo Inc (TEST)",
        })

        cls.user_company_a = cls.internal_user
        cls.user_company_b = cls.env['res.users'].create({
            'name': "%s User (TEST)" % cls.company_b.name,
            'login': 'user_comp_b',
            'password': 'user_comp_b',
            'company_id': cls.company_b.id,
            'company_ids': [Command.set(cls.company_b.ids)],
            'groups_id': [Command.link(cls.group_user.id)],
        })
        cls.multi_comp_user = cls.env['res.users'].create({
            'name': "Multi Company User (TEST)",
            'login': 'user_multi_comp',
            'password': 'user_multi_comp',
            'company_id': cls.company_a.id,
            'company_ids': [Command.set([cls.company_a.id, cls.company_b.id])],
            'groups_id': [Command.link(cls.group_user.id)],
        })

        cls.acquirer_company_b = cls._prepare_acquirer(company=cls.company_b)
