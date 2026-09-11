# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re

from odoo import api, fields, models

THEME_COLOR_FIELDS = [
    "primary_color",
    "primary_text_color",
    "secondary_color",
    "secondary_text_color",
]


class Im_LivechatChannel(models.Model):
    _inherit = ["im_livechat.channel", "bus.listener.mixin"]

    website_theme_sync_url = fields.Char(compute="_compute_website_theme_sync_url")
    theme_colors_synced = fields.Boolean(
        compute="_compute_theme_colors_synced",
        help="Whether this channel's colors currently match its website's theme.",
    )

    @api.depends()
    def _compute_website_theme_sync_url(self):
        for channel in self:
            website = self.env["website"].sudo().search([("channel_id", "=", channel.id)], limit=1)
            channel.website_theme_sync_url = website.get_base_url() if website else False

    @api.depends(*THEME_COLOR_FIELDS)
    def _compute_theme_colors_synced(self):
        for channel in self:
            website = channel._get_website()
            theme_colors = channel._compute_website_theme_colors(website) if website else {}
            channel.theme_colors_synced = bool(website) and all(
                channel[field] == value for field, value in theme_colors.items() if value
            )

    def get_website_theme_colors(self):
        """Colors to preview in the form when the user asks to fetch them."""
        self.ensure_one()
        website = self._get_website()
        if not website:
            return {}
        return {
            field: value
            for field, value in self._compute_website_theme_colors(website).items()
            if value
        }

    def _get_website(self):
        self.ensure_one()
        if not self._origin.id:
            return self.env["website"]
        return self.env["website"].sudo().search([("channel_id", "=", self._origin.id)], limit=1)

    def _compute_website_theme_colors(self, website):
        """Reads the website's actual compiled theme colors server-side:
        Bootstrap prints every entry of the theme's `$colors`/`$theme-colors`
        maps as a `:root` CSS custom property (see website.scss's "already
        printed by Bootstrap" comments), so the color combination 1 values
        are already there, literal and resolved, in the compiled bundle. A
        combo key left undefined by the theme comes through as an empty
        property rather than a missing one, in which case we fall back to
        the theme's global primary/secondary/text color, same as the theme
        itself does when rendering the combination."""
        bundle = (
            self.env["ir.qweb"]
            .with_context(website_id=website.id)
            ._get_asset_bundle(
                "web.assets_frontend",
                css=True,
                js=False,
            )
        )
        css_text = bundle.css().raw.decode("utf-8")
        needed = (
            "o-cc1-btn-primary",
            "primary",
            "o-cc1-btn-primary-text",
            "o-cc1-btn-secondary",
            "secondary",
            "o-cc1-btn-secondary-text",
        )
        pattern = re.compile(
            r"--(" + "|".join(re.escape(name) for name in needed) + r"):\s*([^;]+);",
        )
        colors_by_name = {}
        for match in pattern.finditer(css_text):
            colors_by_name.setdefault(match.group(1), match.group(2).strip())

        primary_color = colors_by_name.get("o-cc1-btn-primary") or colors_by_name.get("primary")
        secondary_color = colors_by_name.get("o-cc1-btn-secondary") or colors_by_name.get("secondary")
        return {
            "primary_color": primary_color,
            "primary_text_color": colors_by_name.get("o-cc1-btn-primary-text")
            or self._get_contrast_color(primary_color),
            "secondary_color": secondary_color,
            "secondary_text_color": colors_by_name.get("o-cc1-btn-secondary-text")
            or self._get_contrast_color(secondary_color),
        }

    def _get_contrast_color(self, hex_color):
        if not hex_color or not re.fullmatch(r"#[0-9a-fA-F]{6}", hex_color):
            return False
        red, green, blue = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
        luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
        return "#000000" if luminance > 0.5 else "#FFFFFF"

    def sync_colors_from_website(self):
        self.ensure_one()
        website = self._get_website()
        if not website:
            return
        colors = {
            field: value
            for field, value in self._compute_website_theme_colors(website).items()
            if value
        }
        self.write(colors)
        self._bus_send("im_livechat.channel/theme_colors_synced", {"id": self.id, **colors})

    def _get_livechat_discuss_channel_vals(
        self, /, *, chatbot_script=None, agent=None, operator_partner, operator_model, **kwargs
    ):
        discuss_channel_vals = super()._get_livechat_discuss_channel_vals(
            agent=agent,
            chatbot_script=chatbot_script,
            operator_partner=operator_partner,
            operator_model=operator_model,
            **kwargs,
        )
        if not discuss_channel_vals:
            return False
        visitor_sudo = self.env["ir.http"]._get_visitor_from_request()
        if visitor_sudo:
            discuss_channel_vals["livechat_visitor_id"] = visitor_sudo.id
            # As chat requested by the visitor, delete the chat requested by an operator if any to avoid conflicts between two flows
            # TODO DBE : Move this into the proper method (open or init mail channel)
            pending_chats_domain = [
                ("is_pending_chat_request", "=", True),
                ("livechat_visitor_id", "=", visitor_sudo.id),
                ("livechat_end_dt", "=", False),
            ]
            for discuss_channel in self.env["discuss.channel"].sudo().search(pending_chats_domain):
                correspondents = (
                    discuss_channel.livechat_agent_partner_ids
                    or discuss_channel.livechat_bot_partner_ids
                )
                discuss_channel._close_livechat_session(
                    message=discuss_channel._get_visitor_leave_message(
                        cancel=True, correspondents=correspondents
                    )
                )
                discuss_channel.is_pending_chat_request = False

        return discuss_channel_vals

    @api.model_create_multi
    def create(self, vals_list):
        channels = super().create(vals_list)
        if self.env.context.get("create_from_website"):
            bot = self.env.ref("im_livechat.chatbot_script_welcome_bot", raise_if_not_found=False)
            self.env.website.channel_id = channels[0].id
            channel_rule_vals = []
            for channel in channels:
                if bot:
                    channel_rule_vals.append(
                        {
                            "channel_id": channel.id,
                            "action": "display_button",
                            "chatbot_script_id": bot.id,
                            "chatbot_enabled_condition": "always",
                        }
                    )
                self.env.user._bus_send(
                    "simple_notification",
                    {
                        "type": "success",
                        "message": self.env._("Channel created: %(name)s", name=channel.name),
                    },
                )
            if channel_rule_vals:
                self.env["im_livechat.channel.rule"].create(channel_rule_vals)
        return channels
