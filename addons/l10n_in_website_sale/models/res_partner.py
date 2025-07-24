from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _update_l10n_in_gst_treatment_and_fp_from_iap_autocomplete(self):

        def _reset_gst_values():
            self.update({
                'l10n_in_gst_treatment': 'consumer',
                'property_account_position_id': False,
            })

        if not self.vat:
            _reset_gst_values()
            return

        response = self.env['res.partner'].enrich_by_gst(self.vat)
        # Response is empty when invalid gst number is sent.
        if not response:
            _reset_gst_values()
            return
        if (
            response.get('error')
            or (gst_treatment := response.get('l10n_in_gst_treatment', 'regular')) == self.l10n_in_gst_treatment
        ):
            return

        fiscal_position = (
            gst_treatment == 'special_economic_zone'
            and self.env['account.chart.template'].ref('fiscal_position_in_export_sez_in', raise_if_not_found=False)
        )
        self.update({
            'l10n_in_gst_treatment': gst_treatment,
            'property_account_position_id': fiscal_position and fiscal_position.id or False,
        })
