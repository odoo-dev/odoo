# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged

from .common import TestLivechatCommon


@tagged("-at_install", "post_install")
class TestWebsiteLivechatThemeColors(TestLivechatCommon):
    def _set_palette_colors(self, website, colors):
        self.env["website.assets"].with_context(website_id=website.id).make_scss_customization(
            "/website/static/src/scss/options/colors/user_color_palette.scss",
            colors,
        )

    def test_get_website_theme_colors_tracks_correct_website_palette(self):
        website_a = self.env.ref("base.default_website")
        self._set_palette_colors(website_a, {"o-color-1": "#112233"})
        website_b = self.env["website"].create({"name": "Second website"})
        channel_b = self.env["im_livechat.channel"].create({"name": "Second channel"})
        website_b.channel_id = channel_b.id
        self._set_palette_colors(website_b, {"o-color-1": "#eeeeee"})
        colors_a = self.livechat_channel.get_website_theme_colors()
        colors_b = channel_b.get_website_theme_colors()
        self.assertEqual(colors_a["primary_color"], "#112233")
        self.assertEqual(colors_b["primary_color"], "#eeeeee")

    def test_theme_colors_sync_when_website_palette_changes(self):
        website = self.env.ref("base.default_website")
        self._set_palette_colors(website, {"o-color-1": "#112233", "o-color-2": "#445566"})
        self.livechat_channel.write(self.livechat_channel.get_website_theme_colors())
        self.assertTrue(self.livechat_channel.theme_colors_synced)
        self._set_palette_colors(website, {"o-color-1": "#eeeeee"})
        self.assertEqual(self.livechat_channel.primary_color, "#eeeeee")
        self.assertTrue(self.livechat_channel.theme_colors_synced)

    def test_theme_colors_do_not_sync_when_set_manually(self):
        website = self.env.ref("base.default_website")
        self._set_palette_colors(website, {"o-color-1": "#112233"})
        self.livechat_channel.write(self.livechat_channel.get_website_theme_colors())
        self.livechat_channel.primary_color = "#000000"
        self.assertFalse(self.livechat_channel.theme_colors_synced)
        self._set_palette_colors(website, {"o-color-1": "#eeeeee"})
        self.assertEqual(self.livechat_channel.primary_color, "#000000")
