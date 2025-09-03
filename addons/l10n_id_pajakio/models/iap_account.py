from odoo import api, models
from odoo.addons.iap import jsonrpc


DEFAULT_IAP_TEST_ENDPOINT = " http://localhost:8469"
IAP_SERVICE_NAME = "l10n_id_pajakio_proxy"

class IapAccount(models.Model):
    _inherit = "iap.account"

    @api.model
    def _l10n_id_pajakio_iap_connect(self, params, url_path, timeout=25):
        """ Helper methdo to do jsonrpc connection to IAP server """
        user_token = self.get(IAP_SERVICE_NAME)
        # always include dbuuid and account token to authorize
        params.update({
            "dbuuid": self.env["ir.config_parameter"].sudo().get_param("database.uuid"),
            "account_token": user_token.account_token,
            "mode": self.env["ir.config_parameter"].sudo().get_param("l10n_id_pajakio.mode")
        })
        endpoint = DEFAULT_IAP_TEST_ENDPOINT
        url = "%s%s" % (endpoint, url_path)
        return jsonrpc(url, params=params, timeout=timeout)
