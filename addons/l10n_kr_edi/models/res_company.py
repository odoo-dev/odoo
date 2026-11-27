# Part of Odoo. See LICENSE file for full copyright and licensing details.
import requests

from odoo import fields, models
from odoo.tools import zeep

L10N_KR_EDI_BAROBILL_URLS = {
    'production': 'https://ws.baroservice.com',
    'staging': 'https://testws.baroservice.com',
}
L10N_KR_EDI_BAROBILL_NOT_FOUND = -21002


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_kr_representative_name = fields.Char(related='partner_id.l10n_kr_representative_name', readonly=False)
    l10n_kr_edi_staging_mode = fields.Boolean(string="Staging mode", groups='base.group_system')
    l10n_kr_edi_barobill_id = fields.Char(string="Barobill ID", groups='base.group_system')
    l10n_kr_edi_certificate_key = fields.Char(string="Certificate Key", groups='base.group_system')

    def _l10n_kr_edi_barobill_call(self, service_name, operation, **kwargs):
        self.ensure_one()
        base_url = L10N_KR_EDI_BAROBILL_URLS['staging' if self.sudo().l10n_kr_edi_staging_mode else 'production']
        certificate_key = self.sudo().l10n_kr_edi_certificate_key or ''
        try:
            client = self._get_zeep_client__(f'{base_url}/{service_name}.asmx?WSDL', timeout=20, operation_timeout=20)
            result = client.service[operation](
                CERTKEY=certificate_key,
                CorpNum=''.join(filter(str.isdigit, self.vat or '')),
                **kwargs,
            )
            if isinstance(result, list):
                code = result[0].BarobillState if len(result) == 1 else 0
                if code == L10N_KR_EDI_BAROBILL_NOT_FOUND:
                    code = 0
            else:
                code = result if isinstance(result, int) else getattr(result, 'BarobillState', 0)
            if code < 0:
                message = client.service.GetErrString(CERTKEY=certificate_key, ErrCode=code)
                if not message or message.lstrip('-').isdigit():
                    return result, self.env._("Barobill error %(code)s. Check the Barobill settings.", code=code)
                return result, self.env._("Barobill error %(code)s: %(message)s", code=code, message=message)
        except (zeep.exceptions.Error, requests.exceptions.RequestException) as error:
            return None, self.env._("Could not reach Barobill: %(error)s", error=error)
        return result, None
