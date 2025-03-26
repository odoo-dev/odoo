from collections import defaultdict

from odoo import fields, models, api


class SmsSms(models.Model):
    _inherit = 'sms.sms'

    sms_twilio_sid = fields.Char(related="sms_tracker_id.sms_twilio_sid", depends=['sms_tracker_id'])
    record_company_id = fields.Many2one('res.company', 'Company', ondelete='set null')
    failure_type = fields.Selection(
        selection_add=[
            ('twilio_authentication', 'Authentication Error"'),
            ('twilio_callback', 'Incorrect callback URL'),
            ('twilio_from_missing', 'Missing From Number'),
            ('twilio_from_to', 'From / To identic'),
            ('twilio_wrong_credentials', 'Twilio Wrong Credentials'),
        ],
    )

    # CRUD
    # ------------------------------------------------------------

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['record_company_id'] = vals.get('record_company_id') or self.env.company.id  # TODO RIGR in master: move this field to SmsSms, and populate it via vals_list from all flows
        return super().create(vals_list)

    # SEND
    # ------------------------------------------------------------

    def _get_sms_company(self):
        return self.mail_message_id.record_company_id or self.record_company_id or super()._get_sms_company()

    def _send_batch_size(self):
        companies = self._get_sms_company()
        if companies and any(company.sms_provider == 'twilio' for company in companies):
            return self.env['ir.config_parameter'].sudo().get_int('sms_twilio.session.batch.size') or 10
        return super()._send_batch_size()

    def _handle_call_result_hook(self, results):
        """
        Store the sid of Twilio on the SMS tracking record (as SMS will be deleted)
        :param results: a list of dict in the form [{
            'uuid': Odoo's id of the SMS,
            'state': State of the SMS in Odoo,
            'sms_twilio_sid': Twilio's id of the SMS,
        }, ...]
        """
        twilio_sms = self.filtered(lambda s: s._get_sms_company().sms_provider == 'twilio')
        grouped_twilio_sms = twilio_sms.grouped("uuid")
        for result in results:
            sms = grouped_twilio_sms.get(result.get('uuid'))
            if sms and sms.sms_tracker_id and result.get('sms_twilio_sid'):
                sms.sms_tracker_id.sms_twilio_sid = result['sms_twilio_sid']
        super(SmsSms, self - twilio_sms)._handle_call_result_hook(results)
