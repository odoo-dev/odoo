from odoo import api, models


# countries where KYC is managed with Peppol and where it is mandatory
COUNTRIES_WITH_PEPPOL = {
    'BE',
    'FR',
    'GP',
    'MQ',
    'RE',
}

# countries where a correct Peppol configuration has a specific EAS code (and which one)
SPECIFIC_PEPPOL_EAS = {
    'FR': '0225',
    'GP': '0225',
    'MQ': '0225',
    'RE': '0225',
}


class KpiProvider(models.AbstractModel):
    _inherit = 'kpi.provider'

    @api.model
    def get_account_peppol_kpi_summary(self):
        results = {}
        all_companies = self.env['res.company'].sudo().search([])
        for company in all_companies:
            country_code = company.partner_id.country_id.code

            # If this company is expected to have set up KYC; otherwise it is ignored
            if country_code in COUNTRIES_WITH_PEPPOL:
                if country_code in SPECIFIC_PEPPOL_EAS \
                        and company.partner_id.peppol_eas != SPECIFIC_PEPPOL_EAS[country_code]:
                    results[company.id] = 'not_done'
                elif company.account_peppol_proxy_state == 'receiver':
                    results[company.id] = 'done'
                elif company.account_peppol_proxy_state in ['in_verification', 'smp_registration']:
                    results[company.id] = 'incomplete'
                else:
                    results[company.id] = 'not_done'

        if not results:
            return []

        all_states = set(results.values())
        if not all_states:
            final_state = 'not_done'
        elif len(all_states) == 1:
            final_state = all_states.pop()
        else:
            final_state = 'incomplete'

        return [{
            'id': 'account_peppol.proxy_state',
            'name': 'KYC',
            'type': 'kyc_status',
            'value': final_state,
        }]

    @api.model
    def get_kpi_summary(self):
        result = super().get_kpi_summary()
        result.extend(self.get_account_peppol_kpi_summary())
        return result
