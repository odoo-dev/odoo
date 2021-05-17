# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class MailMessage(models.Model):
    _inherit = 'mail.message'

    rating_ids = fields.One2many(
        'rating.rating', 'message_id', groups='base.group_user', string='Related ratings')
    rating_value = fields.Float(
        'Rating Value', compute='_compute_rating_value', compute_sudo=True,
        store=False, search='_search_rating_value')

    @api.depends('rating_ids', 'rating_ids.rating')
    def _compute_rating_value(self):
        ratings = self.env['rating.rating'].search(
            [('message_id', 'in', self.ids), ('consumed', '=', True)], order='create_date DESC')
        mapping = dict((r.message_id.id, r.rating) for r in ratings)
        for message in self:
            message.rating_value = mapping.get(message.id, 0.0)

    def _search_rating_value(self, operator, operand):
        ratings = self.env['rating.rating'].sudo().search([
            ('rating', operator, operand),
            ('message_id', '!=', False)
        ])
        return [('id', 'in', ratings.mapped('message_id').ids)]

    def message_format(self):
        message_values = super().message_format()
        ratings = self.env['rating.rating'].search(
            [('message_id', 'in', self.ids), ('consumed', '=', True)])
        if not ratings:
            return message_values
        rating_message_mapping = dict((r.message_id.id, r) for r in ratings)
        for vals in message_values:
            vals.update({
                'rating_img': ('/rating/static/src/img/' + rating_message_mapping[vals['id']]._get_rating_image_filename()) if (vals['id'] in rating_message_mapping) else None,
            })
        return message_values
