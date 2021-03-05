# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, fields, models


class TrackStage(models.Model):
    _name = 'event.track.stage'
    _description = 'Event Track Stage'
    _order = 'sequence, id'

    name = fields.Char(string='Stage Name', required=True, translate=True)
    description = fields.Text(string='Stage description', translate=True)
    sequence = fields.Integer(string='Sequence', default=1)
    mail_template_id = fields.Many2one(
        'mail.template', string='Email Template',
        domain=[('model', '=', 'event.track')],
        help="If set an email will be sent to the customer when the track reaches this step.")
    fold = fields.Boolean(
        string='Folded in Kanban',
        help='This stage is folded in the kanban view when there are no records in that stage to display.')
    status = fields.Selection([
        ('new', 'New'),
        ('announced', 'Announced'),
        ('published', 'Published'),
        ('refused', 'Refused'),
        ('cancelled', 'Cancelled')
    ], string='Track Status', required=True, default='new',
        help="Impacts the visibility of your tracks"\
        "\n - New tracks are not visible and need to be qualified by internal users."\
        "\n - Announced tracks are visible but their description cannot be accessed as they are not ready yet."\
        "\n - Published tracks are fully visible and all set."\
        "\n - Refused tracks are not visible."\
        "\n - Cancelled tracks are not visible.")
    color = fields.Integer(string='Color')
    legend_blocked = fields.Char(
        'Red Kanban Label', default=lambda s: _('Blocked'), translate=True, required=True,
        help='Override the default value displayed for the blocked state for kanban selection.')
    legend_done = fields.Char(
        'Green Kanban Label', default=lambda s: _('Ready for Next Stage'), translate=True, required=True,
        help='Override the default value displayed for the done state for kanban selection.')
    legend_normal = fields.Char(
        'Grey Kanban Label', default=lambda s: _('In Progress'), translate=True, required=True,
        help='Override the default value displayed for the normal state for kanban selection.')
