from odoo import http
from odoo.http import request
import werkzeug
import uuid
import json


class Referral(http.Controller):

    @http.route(['/referral'], type='http', auth='public', website=True)
    def referral_unauth(self, force=False, **kwargs):
        if(not force and not request.website.is_public_user()):
            if(request.env.user.partner_id.referral_tracking_id):
                token = request.env.user.partner_id.referral_tracking_id.token
                return request.redirect('/referral/' + token)  # TODO quid if mismatch between referrer_email & token : créer le referral.tracking plus tôt ?
            else:
                return self.referral_register(request.env.user.partner_id.email)
        else:
            return request.render('website_sale_referral.referral_controller_template_register', {
                'my_referrals': request.env['referral.mixin'].get_example_referral_statuses(),
            })

    @http.route(['/referral/register'], type='http', auth='public', method='POST', website=True)
    def referral_register(self, referrer_email, token=None, **post):
        if(token):
            referral_tracking = request.env['referral.tracking'].search([('token', '=', token)], limit=1)
            if(referral_tracking):
                if(referral_tracking.referrer_email != referrer_email):
                    raise ValueError('Mismatch between email and token')
                else:
                    return request.redirect('/referral/' + referral_tracking.token)
            else:
                pass  # TODO check that the token doesn't already exist
        else:
            token = uuid.uuid4().hex  # Generate random token # TODO differentiate token from db and token generated here

        utm_name = ('%s-%s') % (referrer_email, str(uuid.uuid4())[:6])
        utm_source_id = request.env['utm.source'].sudo().create({'name': utm_name})
        referral_tracking = request.env['referral.tracking'].sudo().create({
            'token': token,
            'utm_source_id': utm_source_id.id,
            'referrer_email': referrer_email,
        })
        if(not request.website.is_public_user() and referrer_email == request.env.user.partner_id.email):
            request.env.user.partner_id.update({'referral_tracking_id': referral_tracking.id})
        return request.redirect('/referral/' + referral_tracking.token)

    @http.route(['/referral/<string:token>'], type='http', auth='public', website=True)
    def referral(self, token, **post):
        referral_tracking = request.env['referral.tracking'].search([('token', '=', token)], limit=1)
        if(not referral_tracking):
            raise ValueError('Incorrect token')  # TODO better error

        my_referrals = self._get_referral_statuses(referral_tracking.sudo().utm_source_id)

        return request.render('website_sale_referral.referral_controller_template', {
            'token': token,
            'referrer_email': referral_tracking.referrer_email,
            'my_referrals': my_referrals,
        })

    @http.route(['/referral/send'], type='json', auth='public', method='POST', website=True)
    def referral_send(self, **post):
        token = post.get('token')
        if(not token):
            raise ValueError('no token provided')  # TODO better error

        referral_tracking = request.env['referral.tracking'].search([('token', '=', token)], limit=1)
        self.utm_source_id_id = referral_tracking.sudo().utm_source_id.id

        link_tracker = request.env['link.tracker'].sudo().create({
            'url': request.env['ir.config_parameter'].sudo().get_param('website_sale_referral.redirect_page') or request.env["ir.config_parameter"].sudo().get_param("web.base.url"),
            'campaign_id': request.env.ref('website_sale_referral.utm_campaign_referral').id,
            'source_id': self.utm_source_id_id,
            'medium_id': request.env.ref('utm.utm_medium_%s' % post.get('channel')).id
        })

        return {'link': self._get_link_tracker_url(link_tracker, post.get('channel'))}

    def _get_referral_statuses(self, utm_source_id):
        return request.env['sale.order'].sudo().get_referral_statuses(utm_source_id)

    def _get_link_tracker_url(self, link_tracker, channel):
        if channel == 'direct':
            return link_tracker.short_url
        if channel == 'facebook':
            return 'https://www.facebook.com/sharer/sharer.php?u=%s' % link_tracker.short_url
        elif channel == 'twitter':
            return 'https://twitter.com/intent/tweet?tw_p=tweetbutton&text=You have been refered Check here: %s' % link_tracker.short_url
        elif channel == 'linkedin':
            return 'https://www.linkedin.com/shareArticle?mini=true&url=%s' % link_tracker.short_url
