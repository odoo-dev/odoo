# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, models


class WebsiteAssets(models.AbstractModel):
    _inherit = 'website.assets'

    @api.model
    def make_scss_customization(self, url, values):
        self_ = self
        if not self.env.website and (host_id := self.env.context.get("host_id")):
            self_ = self.with_context(website_id=host_id)
        website = self_.env.website or self.env["website"]
        should_resync = website and website.channel_id.theme_colors_synced
        result = super().make_scss_customization(url, values)
        if should_resync:
            website.channel_id.sync_colors_from_website()
        return result
