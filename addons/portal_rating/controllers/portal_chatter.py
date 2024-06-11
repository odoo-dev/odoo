# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.http import request
from odoo.osv import expression

from odoo.addons.portal.controllers import mail


class PortalChatter(mail.PortalChatter):

    def _portal_post_filter_params(self):
        fields = super(PortalChatter, self)._portal_post_filter_params()
        fields += ['rating_value', 'rating_feedback']
        return fields

    def _portal_rating_stats(self, res_model, res_id, **kwargs):
        # get the rating statistics for the record
        if kwargs.get('rating_include'):
            record = request.env[res_model].browse(res_id)
            if hasattr(record, 'rating_get_stats'):
                return {'rating_stats': record.sudo().rating_get_stats()}
        return {}

    @http.route()
    def portal_chatter_post(self, res_model, res_id, message, attachment_ids='', attachment_tokens='', **kwargs):
        if kwargs.get('rating_value'):
            kwargs['rating_feedback'] = kwargs.pop('rating_feedback', message)
        return super(PortalChatter, self).portal_chatter_post(res_model, res_id, message, attachment_ids=attachment_ids, attachment_tokens=attachment_tokens, **kwargs)

    @http.route()
    def portal_chatter_init(self, res_model, res_id, domain=False, limit=False, **kwargs):
        result = super(PortalChatter, self).portal_chatter_init(res_model, res_id, domain=domain, limit=limit, **kwargs)
        result.update(self._portal_rating_stats(res_model, res_id, **kwargs))
        return result

    def _get_void_portal_messages_domain(self):
        """Override the domain to include messages with ratings."""
        domain = super()._get_void_portal_messages_domain()
        if request.env.context.get("rating_include"):
            return expression.OR([domain, [("rating_ids", "!=", False)]])
        return domain

    @http.route()
    def portal_message_fetch(self, res_model, res_id, domain=False, limit=False, offset=False, **kw):
        # add 'rating_include' in context, to fetch them in portal_message_format
        if kw.get('rating_include'):
            request.update_context(rating_include=True)
        result = super(PortalChatter, self).portal_message_fetch(res_model, res_id, domain=domain, limit=limit, offset=offset, **kw)
        result.update(self._portal_rating_stats(res_model, res_id, **kw))
        return result

    def _setup_portal_message_fetch_extra_domain(self, data):
        domains = [super()._setup_portal_message_fetch_extra_domain(data)]
        if data.get('rating_value', False) is not False:
            domains.append([('rating_value', '=', float(data['rating_value']))])
        return expression.AND(domains)
