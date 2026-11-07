from odoo import _, api, models, exceptions


class UtmSource(models.Model):
    _inherit = 'utm.source'

    _marketing_card__utm_source_marketing_card = models.Ref('marketing_card.utm_source_marketing_card', 'utm.source', required=False)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_utm_source_marketing_card(self):
        utm_source_marketing_card = self._marketing_card__utm_source_marketing_card
        if utm_source_marketing_card in self:
            raise exceptions.UserError(_(
                "The UTM source '%s' cannot be deleted as it is used to promote marketing cards campaigns.",
                utm_source_marketing_card.name
            ))
