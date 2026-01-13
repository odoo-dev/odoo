from odoo import api, models


class IrRule(models.Model):
    _inherit = 'ir.rule'

    @api.model
    def _eval_context(self):
        res = super()._eval_context()
        # We need is_frontend to avoid showing website's company items in backend
        # (that could be different than current company).
        res['website'] = self.env['website'].get_current_website(fallback=False)
        return res

    def _compute_domain_keys(self):
        """ Return the list of context keys to use for caching ``_compute_domain``. """
        return super(IrRule, self)._compute_domain_keys() + ['website_id']
