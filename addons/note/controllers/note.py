# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.http import request


class NoteController(http.Controller):

    @http.route('/note/new', type='json', auth='user')
    def note_new_from_systray(self, note, activity_type_id=None, date_deadline=None):  #NOTE: NEED TO BE UPDATED ??
        """ Route to create note and their activity directly from the systray """
        note = request.env['project.task'].create({'description': note})
        if date_deadline:
            note.activity_schedule(
                activity_type_id=activity_type_id or request.env['mail.activity.type'].search([('category', '=', 'reminder')], limit=1).id,
                note=note.memo,
                date_deadline=date_deadline
            )
        return note.id
