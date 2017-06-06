# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from hashlib import sha1
from time import time

from odoo import http
from odoo.http import request
from odoo.addons.payment.controllers.main import _message_post_helper


class WebsiteMail(http.Controller):

    @http.route(['/website_mail/follow'], type='json', auth="public", website=True)
    def website_message_subscribe(self, id=0, object=None, message_is_follower="on", email=False, **post):
        # TDE FIXME: check this method with new followers
        res_id = int(id)
        is_follower = message_is_follower == 'on'
        record = request.env[object].browse(res_id)

        # search partner_id
        if request.env.user != request.website.user_id:
            partner_ids = request.env.user.partner_id.ids
        else:
            # mail_thread method
            partner_ids = record.sudo()._find_partner_from_emails([email], check_followers=True)
            if not partner_ids or not partner_ids[0]:
                name = email.split('@')[0]
                partner_ids = request.env['res.partner'].sudo().create({'name': name, 'email': email}).ids
        # add or remove follower
        if is_follower:
            record.check_access_rule('read')
            record.sudo().message_unsubscribe(partner_ids)
            return False
        else:
            record.check_access_rule('read')
            # add partner to session
            request.session['partner_id'] = partner_ids[0]
            record.sudo().message_subscribe(partner_ids)
            return True

    @http.route(['/website_mail/is_follower'], type='json', auth="public", website=True)
    def is_follower(self, model, res_id, **post):
        user = request.env.user
        partner = None
        public_user = request.website.user_id
        if user != public_user:
            partner = request.env.user.partner_id
        elif request.session.get('partner_id'):
            partner = request.env['res.partner'].sudo().browse(request.session.get('partner_id'))

        values = {
            'is_user': user != public_user,
            'email': partner.email if partner else "",
            'is_follower': False,
            'alias_name': False,
        }

        record = request.env[model].sudo().browse(int(res_id))
        if record and partner:
            values['is_follower'] = bool(request.env['mail.followers'].search_count([
                ('res_model', '=', model),
                ('res_id', '=', record.id),
                ('partner_id', '=', partner.id)
            ]))
        return values

    @http.route(['/website_mail/post/json'], type='json', auth='public', website=True)
    def chatter_json(self, res_model='', res_id=None, message='', **kw):
        try:
            msg = _message_post_helper(res_model, int(res_id), message, **kw)
        except Exception:
            return False
        data = {
            'id': msg.id,
            'body': msg.body,
            'date': msg.date,
            'author': msg.author_id.name,
            'image_url': '/mail/%s/%s/avatar/%s' % (msg.model, msg.res_id, msg.author_id.id)
        }
        return data

    @http.route(['/website_mail/post/post'], type='http', methods=['POST'], auth='public', website=True)
    def chatter_post(self, res_model='', res_id=None, message='', redirect=None, **kw):
        url = request.httprequest.referrer
        if message:
            message = _message_post_helper(res_model, int(res_id), message, **kw)
            url = url + "#message-%s" % (message.id,)
        return request.redirect(url)
