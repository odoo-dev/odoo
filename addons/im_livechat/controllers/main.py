# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup
from werkzeug.exceptions import NotFound

from odoo import http, tools, _
from odoo.addons.base.models.ir_qweb_fields import nl2br
from odoo.http import request
from odoo.tools import html_sanitize


class LivechatController(http.Controller):

    # Note: the `cors` attribute on many routes is meant to allow the livechat
    # to be embedded in an external website.

    @http.route('/im_livechat/external_lib.<any(css,js):ext>', type='http', auth='public', cors='*')
    def external_lib(self, ext, **kwargs):
        """ Preserve compatibility with legacy livechat imports. Only
        serves javascript since the css will be fetched by the shadow
        DOM of the livechat to avoid conflicts.
        """
        bundle = 'im_livechat.assets_embed'
        asset = request.env["ir.qweb"]._get_asset_bundle(bundle)
        if ext == 'css':
            raise request.not_found()
        stream = request.env['ir.binary']._get_stream_from(asset.js())
        return stream.get_response()

    @http.route('/im_livechat/assets_embed.<any(css, js):ext>', type='http', auth='public', cors='*')
    def assets_embed(self, ext, **kwargs):
        bundle = 'im_livechat.assets_embed'
        asset = request.env["ir.qweb"]._get_asset_bundle(bundle)
        if ext not in ('css', 'js'):
            raise request.not_found()
        stream = request.env['ir.binary']._get_stream_from(getattr(asset, ext)())
        return stream.get_response()

    @http.route('/im_livechat/font-awesome', type='http', auth='none', cors="*")
    def fontawesome(self, **kwargs):
        return http.Stream.from_path('web/static/src/libs/fontawesome/fonts/fontawesome-webfont.woff2').get_response()

    @http.route('/im_livechat/emoji_bundle', type='http', auth='public', cors='*')
    def get_emoji_bundle(self):
        bundle = 'mail.assets_emoji'
        asset = request.env["ir.qweb"]._get_asset_bundle(bundle)
        stream = request.env['ir.binary']._get_stream_from(asset.js())
        return stream.get_response()

    @http.route('/im_livechat/load_templates', type='json', auth='none', cors="*")
    def load_templates(self, **kwargs):
        templates = self._livechat_templates_get()
        return [tools.file_open(tmpl, 'rb').read() for tmpl in templates]

    def _livechat_templates_get(self):
        return [
            'im_livechat/static/src/legacy/widgets/feedback/feedback.xml',
            'im_livechat/static/src/legacy/widgets/public_livechat_window/public_livechat_window.xml',
            'im_livechat/static/src/legacy/widgets/public_livechat_view/public_livechat_view.xml',
            'im_livechat/static/src/legacy/public_livechat_chatbot.xml',
        ]

    @http.route('/im_livechat/support/<int:channel_id>', type='http', auth='public')
    def support_page(self, channel_id, **kwargs):
        channel = request.env['im_livechat.channel'].sudo().browse(channel_id)
        return request.render('im_livechat.support_page', {'channel': channel})

    @http.route('/im_livechat/loader/<int:channel_id>', type='http', auth='public')
    def loader(self, channel_id, **kwargs):
        username = kwargs.get("username", _("Visitor"))
        channel = request.env['im_livechat.channel'].sudo().browse(channel_id)
        info = channel.get_livechat_info(username=username)
        return request.render('im_livechat.loader', {'info': info}, headers=[('Content-Type', 'application/javascript')])

    @http.route('/im_livechat/init', type='json', auth="public", cors="*")
    def livechat_init(self, channel_id):
        operator_available = len(request.env['im_livechat.channel'].sudo().browse(channel_id).available_operator_ids)
        rule = {}
        # find the country from the request
        country_id = False
        if request.geoip.country_code:
            country_id = request.env['res.country'].sudo().search([('code', '=', request.geoip.country_code)], limit=1).id
        # extract url
        url = request.httprequest.headers.get('Referer')
        # find the first matching rule for the given country and url
        matching_rule = request.env['im_livechat.channel.rule'].sudo().match_rule(channel_id, url, country_id)
        if matching_rule and (not matching_rule.chatbot_script_id or matching_rule.chatbot_script_id.script_step_ids):
            frontend_lang = request.httprequest.cookies.get('frontend_lang', request.env.user.lang or 'en_US')
            matching_rule = matching_rule.with_context(lang=frontend_lang)
            rule = {
                'action': matching_rule.action,
                'auto_popup_timer': matching_rule.auto_popup_timer,
                'regex_url': matching_rule.regex_url,
            }
            if matching_rule.chatbot_script_id.active and (not matching_rule.chatbot_only_if_no_operator or
               (not operator_available and matching_rule.chatbot_only_if_no_operator)) and matching_rule.chatbot_script_id.script_step_ids:
                chatbot_script = matching_rule.chatbot_script_id
                rule.update({'chatbot': chatbot_script._format_for_frontend()})
        return {
            'available_for_me': (rule and rule.get('chatbot'))
                                or operator_available and (not rule or rule['action'] != 'hide_button'),
            'rule': rule,
        }

    @http.route('/im_livechat/operator/<int:operator_id>/avatar',
        type='http', auth="public", cors="*")
    def livechat_operator_get_avatar(self, operator_id):
        """ Custom route allowing to retrieve an operator's avatar.

        This is done to bypass more complicated rules, notably 'website_published' when the website
        module is installed.

        Here, we assume that if you are a member of at least one im_livechat.channel, then it's ok
        to make your avatar publicly available.

        We also make the chatbot operator avatars publicly available. """

        is_livechat_member = False
        operator = request.env['res.partner'].sudo().browse(operator_id)
        if operator.exists():
            is_livechat_member = bool(request.env['im_livechat.channel'].sudo().search_count([
                ('user_ids', 'in', operator.user_ids.ids)
            ]))

        if not is_livechat_member:
            # we don't put chatbot operators as livechat members (because we don't have a user_id for them)
            is_livechat_member = bool(request.env['chatbot.script'].sudo().search_count([
                ('operator_partner_id', 'in', operator.ids)
            ]))

        return request.env['ir.binary']._get_image_stream_from(
            operator if is_livechat_member else request.env['res.partner'],
            field_name='avatar_128',
            placeholder='mail/static/src/img/smiley/avatar.jpg',
        ).get_response()

    @http.route('/im_livechat/get_session', type="json", auth='public', cors="*")
    def get_session(self, channel_id, anonymous_name, previous_operator_id=None, chatbot_script_id=None, persisted=True, **kwargs):
        user_id = None
        country_id = None
        # if the user is identifiy (eg: portal user on the frontend), don't use the anonymous name. The user will be added to session.
        if request.session.uid:
            user_id = request.env.user.id
            country_id = request.env.user.country_id.id
        else:
            # if geoip, add the country name to the anonymous name
            if request.geoip.country_code:
                # get the country of the anonymous person, if any
                country = request.env['res.country'].sudo().search([('code', '=', request.geoip.country_code)], limit=1)
                if country:
                    country_id = country.id

        if previous_operator_id:
            previous_operator_id = int(previous_operator_id)

        chatbot_script = False
        if chatbot_script_id:
            frontend_lang = request.httprequest.cookies.get('frontend_lang', request.env.user.lang or 'en_US')
            chatbot_script = request.env['chatbot.script'].sudo().with_context(lang=frontend_lang).browse(chatbot_script_id)

        return request.env["im_livechat.channel"].with_context(lang=False).sudo().browse(channel_id)._open_livechat_discuss_channel(
            anonymous_name,
            previous_operator_id=previous_operator_id,
            chatbot_script=chatbot_script,
            user_id=user_id,
            country_id=country_id,
            persisted=persisted,
            lang=request.httprequest.cookies.get('frontend_lang')
        )

    def _post_feedback_message(self, channel, rating, reason):
        if reason:
            reason = Markup('<br>%s') % html_sanitize(nl2br(reason))
        body = Markup('''
            <div class="o_mail_notification o_hide_author">
                %(rating)s: <img class="o_livechat_emoji_rating" src="%(rating_url)s" alt="rating"/>%(reason)s
            </div>
        ''') % {
            'rating': _('Rating'),
            'rating_url': rating.rating_image_url,
            'reason': reason or '',
        }
        channel.message_post(body=body, message_type='notification', subtype_xmlid='mail.mt_comment')

    @http.route('/im_livechat/feedback', type='json', auth='public', cors="*")
    def feedback(self, uuid, rate, reason=None, **kwargs):
        channel = request.env['discuss.channel'].sudo().search([('uuid', '=', uuid)], limit=1)
        if channel:
            # limit the creation : only ONE rating per session
            values = {
                'rating': rate,
                'consumed': True,
                'feedback': reason,
                'is_internal': False,
            }
            if not channel.rating_ids:
                values.update({
                    'res_id': channel.id,
                    'res_model_id': request.env['ir.model']._get_id('discuss.channel'),
                })
                # find the partner (operator)
                if channel.channel_partner_ids:
                    values['rated_partner_id'] = channel.channel_partner_ids[0].id
                # if logged in user, set its partner on rating
                values['partner_id'] = request.env.user.partner_id.id if request.session.uid else False
                # create the rating
                rating = request.env['rating.rating'].sudo().create(values)
            else:
                rating = channel.rating_ids[0]
                rating.write(values)
            self._post_feedback_message(channel, rating, reason)
            return rating.id
        return False

    @http.route('/im_livechat/history', type="json", auth="public", cors="*")
    def history_pages(self, pid, channel_uuid, page_history=None):
        partner_ids = (pid, request.env.user.partner_id.id)
        channel = request.env['discuss.channel'].sudo().search([('uuid', '=', channel_uuid), ('channel_partner_ids', 'in', partner_ids)])
        if channel:
            channel._send_history_message(pid, page_history)
        return True

    @http.route('/im_livechat/notify_typing', type='json', auth='public', cors="*")
    def notify_typing(self, uuid, is_typing):
        """ Broadcast the typing notification of the website user to other channel members
            :param uuid: (string) the UUID of the livechat channel
            :param is_typing: (boolean) tells whether the website user is typing or not.
        """
        channel = request.env['discuss.channel'].sudo().search([('uuid', '=', uuid)])
        if not channel:
            raise NotFound()
        channel_member = channel.env['discuss.channel.member'].search([('channel_id', '=', channel.id), ('partner_id', '=', request.env.user.partner_id.id)])
        if not channel_member:
            raise NotFound()
        channel_member._notify_typing(is_typing=is_typing)

    @http.route('/im_livechat/email_livechat_transcript', type='json', auth='public', cors="*")
    def email_livechat_transcript(self, uuid, email):
        channel = request.env['discuss.channel'].sudo().search([
            ('channel_type', '=', 'livechat'),
            ('uuid', '=', uuid)], limit=1)
        if channel:
            channel._email_livechat_transcript(email)

    @http.route('/im_livechat/visitor_leave_session', type='json', auth="public", cors="*")
    def visitor_leave_session(self, uuid):
        """ Called when the livechat visitor leaves the conversation.
         This will clean the chat request and warn the operator that the conversation is over.
         This allows also to re-send a new chat request to the visitor, as while the visitor is
         in conversation with an operator, it's not possible to send the visitor a chat request."""
        discuss_channel = request.env['discuss.channel'].sudo().search([('uuid', '=', uuid)])
        if discuss_channel:
            discuss_channel._close_livechat_session()

    @http.route('/im_livechat/chat_post', type="json", auth="public", cors="*")
    def im_livechat_chat_post(self, uuid, message_content, context=None):
        if context:
            request.update_context(**context)
        channel = request.env["discuss.channel"].sudo().search([('uuid', '=', uuid)], limit=1)
        if not channel:
            return False
        # find the author from the user session
        if request.session.uid:
            author = request.env['res.users'].sudo().browse(request.session.uid).partner_id
            author_id = author.id
            email_from = author.email_formatted
        else:  # If Public User, use catchall email from company
            author_id = False
            email_from = channel.anonymous_name or channel.create_uid.company_id.catchall_formatted
        # post a message without adding followers to the channel. email_from=False avoid to get author from email data
        body = html_sanitize(message_content) # contains html such as links.
        message = channel.with_context(mail_create_nosubscribe=True).message_post(
            author_id=author_id,
            email_from=email_from,
            body=body,
            message_type='comment',
            subtype_xmlid='mail.mt_comment'
        )
        message_format = message.message_format()[0]
        if 'temporary_id' in request.context:
            message_format['temporary_id'] = request.env.context['temporary_id']
        return message.message_format()[0] if message else False

    @http.route(['/im_livechat/chat_history'], type="json", auth="public", cors="*")
    def im_livechat_chat_history(self, uuid, last_id=False, limit=20):
        channel = request.env["discuss.channel"].sudo().search([('uuid', '=', uuid)], limit=1)
        if not channel:
            return []
        else:
            return channel._channel_fetch_message(last_id, limit)
