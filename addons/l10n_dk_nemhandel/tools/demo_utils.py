# Part of Odoo. See LICENSE file for full copyright and licensing details.

from base64 import b64encode
from decorator import decorator
import uuid

from odoo import _, fields, modules, tools
from odoo.tools.misc import file_open

DEMO_BILL_PATH = 'l10n_dk_nemhandel/tools/demo_bill'
DEMO_ENC_KEY = 'l10n_dk_nemhandel/tools/enc_key'
DEMO_PRIVATE_KEY = 'l10n_dk_nemhandel/tools/private_key.pem'

# -------------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------------

def get_demo_vendor_bill(user):
    return {
        'direction': 'incoming',
        'receiver': user.edi_identification,
        'uuid': f'{user.company_id.id}_demo_vendor_bill',
        'accounting_supplier_party': '0208:2718281828',
        'state': 'done',
        'filename': f'{user.company_id.id}_demo_vendor_bill',
        'enc_key': file_open(DEMO_ENC_KEY, mode='rb').read(),
        'document': file_open(DEMO_BILL_PATH, mode='rb').read(),
    }

# -------------------------------------------------------------------------
# MOCKED FUNCTIONS
# -------------------------------------------------------------------------

def _mock_make_request(func, self, *args, **kwargs):

    def _mock_get_all_documents(user, args, kwargs):
        if not user.env['account.move'].search_count([
            ('l10n_dk_nemhandel_message_uuid', '=', f'{user.company_id.id}_demo_vendor_bill')
        ]):
            return {'messages': [get_demo_vendor_bill(user)]}
        return {'messages': []}

    def _mock_get_document(user, args, kwargs):
        message_uuid = args[1]['message_uuids'][0]
        if message_uuid.endswith('_demo_vendor_bill'):
            return {message_uuid: get_demo_vendor_bill(user)}
        return {message_uuid: {'state': 'done'}}

    def _mock_send_document(user, args, kwargs):
        # Trigger the reception of vendor bills
        get_messages_cron = user.env['ir.cron'].sudo().env.ref(
            'l10n_dk_nemhandel.ir_cron_l10n_dk_nemhandel_get_new_documents',
            raise_if_not_found=False,
        )
        if get_messages_cron:
            get_messages_cron._trigger()
        return {
            'messages': [{
                'message_uuid': 'demo_%s' % uuid.uuid4(),
            } for i in args[1]['documents']],
        }

    endpoint = args[0].split('/')[-1]
    return {
        'ack': lambda _user, _args, _kwargs: {},
        'activate_participant': lambda _user, _args, _kwargs: {},
        'get_all_documents': _mock_get_all_documents,
        'get_document': _mock_get_document,
        'participant_status': lambda _user, _args, _kwargs: {'nemhandel_state': 'active'},
        'send_document': _mock_send_document,
    }[endpoint](self, args, kwargs)

def _mock_button_verify_partner_endpoint(func, self, *args, **kwargs):
    self.ensure_one()
    self.l10n_dk_nemhandel_validity_last_check = fields.Date.today()
    self.l10n_dk_nemhandel_is_endpoint_valid = True

def _mock_user_creation(func, self, *args, **kwargs):
    func(self, *args, **kwargs)
    self.write({
        'l10n_dk_nemhandel_proxy_state': 'active',
    })
    self.l10n_dk_nemhandel_edi_user.write({
        'private_key': b64encode(file_open(DEMO_PRIVATE_KEY, 'rb').read()),
    })

def _mock_deregister_participant(func, self, *args, **kwargs):
    # Set documents sent in demo to a state where they can be re-sent
    demo_moves = self.env['account.move'].search([
        ('company_id', '=', self.company_id.id),
        ('l10n_dk_nemhandel_message_uuid', '=like', 'demo_%'),
    ])
    demo_moves.write({
        'l10n_dk_nemhandel_message_uuid': None,
        'l10n_dk_nemhandel_move_state': None,
    })
    demo_moves.message_main_attachment_id.unlink()
    demo_moves.ubl_cii_xml_id.unlink()
    log_message = _('The Nemahndel status of the documents has been reset when switching from Demo to Live.')
    demo_moves._message_log_batch(bodies=dict((move.id, log_message) for move in demo_moves))

    # also unlink the demo vendor bill
    self.env['account.move'].search([
        ('company_id', '=', self.company_id.id),
        ('l10n_dk_nemhandel_message_uuid', '=', f'{self.company_id.id}_demo_vendor_bill'),
    ]).unlink()

    mode_constraint = self.env['ir.config_parameter'].get_param('l10n_dk_nemhandel.mode_constraint')
    self.l10n_dk_nemhandel_edi_user.unlink()
    self.l10n_dk_nemhandel_proxy_state = 'not_registered'
    self.l10n_dk_nemhandel_edi_mode = mode_constraint


def _mock_update_user_data(func, self, *args, **kwargs):
    pass

_demo_behaviour = {
    '_make_request': _mock_make_request,
    'button_l10n_dk_nemhandel_check_partner_endpoint': _mock_button_verify_partner_endpoint,
    'button_l10n_dk_nemhandel_create_proxy_user': _mock_user_creation,
    'button_l10n_dk_nemhandel_deregister_participant': _mock_deregister_participant,
    'button_l10n_dk_nemhandel_update_user_data': _mock_update_user_data,
}

# -------------------------------------------------------------------------
# DECORATORS
# -------------------------------------------------------------------------

@decorator
def handle_demo(func, self, *args, **kwargs):
    """ This decorator is used on methods that should be mocked in demo mode.

    First handle the decision: "Are we in demo mode?", and conditionally decide which function to
    execute. Whether we are in demo mode depends on the edi_mode of the EDI user, but the EDI user
    is accessible in different ways depending on the model the function is called from and in some
    contexts it might not yet exist, in which case demo mode should instead depend on the content
    of the "l10n_dk_nemhandel.edi.mode" config param.
    """
    def get_demo_mode_account_edi_proxy_client_user(self, args, kwargs):
        if self.id:
            return self.edi_mode == 'demo' and self.proxy_type == 'nemhandel'
        demo_param = self.env['ir.config_parameter'].get_param('l10n_dk_nemhandel.edi.mode') == 'demo'
        if len(args) > 1 and 'proxy_type' in args[1]:
            return demo_param and args[1]['proxy_type'] == 'nemhandel'
        return demo_param

    def get_demo_mode_res_config_settings(self, args, kwargs):
        if self.l10n_dk_nemhandel_edi_user:
            return self.l10n_dk_nemhandel_edi_user.edi_mode == 'demo'
        return self.l10n_dk_nemhandel_edi_mode == 'demo'

    def get_demo_mode_res_partner(self, args, kwargs):
        l10n_dk_nemhandel_edi_user = self.env.company.account_edi_proxy_client_ids.filtered(lambda user: user.proxy_type == 'nemhandel')
        if l10n_dk_nemhandel_edi_user:
            return l10n_dk_nemhandel_edi_user.edi_mode == 'demo'
        return False

    get_demo_mode = {
        'account_edi_proxy_client.user': get_demo_mode_account_edi_proxy_client_user,
        'res.config.settings': get_demo_mode_res_config_settings,
        'res.partner': get_demo_mode_res_partner,
    }
    demo_mode = get_demo_mode.get(self._name) and get_demo_mode[self._name](self, args, kwargs) or False

    if not demo_mode or tools.config['test_enable'] or modules.module.current_test:
        return func(self, *args, **kwargs)
    return _demo_behaviour[func.__name__](func, self, *args, **kwargs)
