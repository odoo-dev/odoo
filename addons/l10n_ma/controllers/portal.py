from odoo.addons.account.controllers.portal import PortalAccount


class L10nMAPortalAccount(PortalAccount):

    def _is_morocco_fiscal_country(self):
        return self.env.company.account_fiscal_country_id.code == "MA"

    def _prepare_address_form_values(self, *args, **kwargs):
        rendering_values = super()._prepare_address_form_values(*args, **kwargs)
        if rendering_values["country"].code != "MA" and not self._is_morocco_fiscal_country():
            return rendering_values

        current_partner = rendering_values["current_partner"]
        current_ice = current_partner and current_partner._get_additional_identifier("MA_ICE")
        ice_warning = ""
        if current_ice and not rendering_values["can_edit_commercial_fields"]:
            ice_warning = self.env._(
                "Modifying the ICE number is not allowed once documents have been issued for your"
                " account. Please contact us directly if that's what you intend to do."
            )

        return {
            **rendering_values,
            "current_ice": current_ice,
            "ice_warning": ice_warning,
        }

    def _validate_address_values(self, partner_sudo, address_values, address_type, *args, **kwargs):
        invalid_fields, missing_fields, error_messages = super()._validate_address_values(
            partner_sudo, address_values, address_type, *args, **kwargs
        )
        if address_type == "billing" and self._is_morocco_fiscal_country():
            ice_number = address_values.get('ma_ice')
            if ice_number and (len(ice_number) != 15 or not ice_number.isdigit()):
                invalid_fields.update({"ma_ice"})
                error_messages.append(self.env._("ICE number should consist of 15 digits."))
        return invalid_fields, missing_fields, error_messages
