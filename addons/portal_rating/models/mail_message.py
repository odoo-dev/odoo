# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools import format_datetime


class MailMessage(models.Model):
    _inherit = 'mail.message'

    def _portal_get_default_format_properties_names(self, options=None):
        """ Add request for rating information

        :param dict options: supports 'rating_include' option allowing to
          conditionally include rating information;
        """
        properties_names = super()._portal_get_default_format_properties_names()
        if options and options.get('rating_include'):
            properties_names |= {
                'rating',
                'rating_value',
            }
        return properties_names

    def _portal_message_format(self, properties_names, options=None):
        """ If requested, add rating information to returned formatted values.

        Note: rating information combine both statistics (see 'rating_get_stats'
        if available on model) and rating / publication information. """
        vals_list = super()._portal_message_format(properties_names, options=options)
        if not 'rating' in properties_names:
            return vals_list

        related_rating = self.env['rating.rating'].sudo().search_read(
            [('message_id', 'in', self.ids)],
            ["id", "publisher_comment", "publisher_id", "publisher_datetime", "message_id"]
        )
        message_to_rating = {
            rating['message_id'][0]: self._portal_message_format_rating(rating)
            for rating in related_rating
        }
        ratings_stats = {}
        for res_model_name, messages in self.grouped('model').items():
            recordset = self.env[res_model_name].browse(messages.mapped('res_id'))
            if not hasattr(recordset, 'rating_get_stats'):
                continue
            ratings_stats.update(recordset.sudo().rating_get_stats())

        for message, values in zip(self, vals_list):
            values["rating"] = message_to_rating.get(message.id, {})
            if ratings_stats.get(message.res_id):
                values['rating_stats'] = ratings_stats.get(message.res_id)

        return vals_list

    def _portal_message_format_rating(self, rating_values):
        """ From 'rating_values' get an updated version formatted for frontend
        display.

        :param dict rating_values: values coming from reading ratings
          in database;

        :return dict: updated rating_values
        """
        publisher_id, publisher_name = rating_values['publisher_id'] or [False, '']
        rating_values['publisher_avatar'] = f'/web/image/res.partner/{publisher_id}/avatar_128/50x50' if publisher_id else ''
        rating_values['publisher_comment'] = rating_values['publisher_comment'] or ''
        rating_values['publisher_datetime'] = format_datetime(self.env, rating_values['publisher_datetime'])
        rating_values['publisher_id'] = publisher_id
        rating_values['publisher_name'] = publisher_name
        return rating_values
