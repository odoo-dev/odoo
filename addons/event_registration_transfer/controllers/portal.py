# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug.exceptions import NotFound

from odoo.addons.event.controllers.portal import EventPortal
from odoo.exceptions import AccessError, MissingError, UserError
from odoo.http import request, route


class EventRegistrationTransferPortal(EventPortal):

    def _get_owned_registration_sudo(self, registration_id):
        """ Return the registration if it belongs to the current user. Ownership
        is checked explicitly: event officers may read every registration, but
        must not transfer other people's tickets from their portal. """
        registration_sudo = request.env['event.registration'].sudo().browse(registration_id).exists()
        if not registration_sudo or registration_sudo.partner_id != request.env.user.partner_id:
            raise NotFound()
        return registration_sudo

    @route('/my/events/<int:registration_id>/transfer', type='http', auth='user', website=True,
           methods=['GET', 'POST'])
    def portal_registration_transfer(self, registration_id, recipient=None, **kwargs):
        registration_sudo = self._get_owned_registration_sudo(registration_id)
        error = False
        if request.httprequest.method == 'POST':
            try:
                partner_sudo = registration_sudo._find_transfer_recipient(recipient)
                request.env['event.registration.transfer'].sudo()._action_request(registration_sudo, partner_sudo)
            except UserError as e:
                error = e.args[0]
            else:
                return request.redirect('/my/events?transfer=sent')
        values = self._prepare_portal_layout_values()
        values.update({
            'page_name': 'event_transfer',
            'registration': registration_sudo,
            'blocking_reason': registration_sudo._get_transfer_blocking_reason(),
            'recipient': recipient or '',
            'error': error,
        })
        return request.render('event_registration_transfer.portal_registration_transfer', values)

    @route('/my/events/transfer/<int:transfer_id>/revoke', type='http', auth='user', website=True,
           methods=['POST'])
    def portal_registration_transfer_revoke(self, transfer_id, **kwargs):
        transfer_sudo = request.env['event.registration.transfer'].sudo().browse(transfer_id).exists()
        if not transfer_sudo or transfer_sudo.sender_partner_id != request.env.user.partner_id:
            raise NotFound()
        try:
            transfer_sudo.action_revoke()
        except UserError:
            return request.redirect('/my/events?transfer=error')
        return request.redirect('/my/events?transfer=revoked')

    @route('/my/events/transfer/<int:transfer_id>/return', type='http', auth='user', website=True,
           methods=['POST'])
    def portal_registration_transfer_return(self, transfer_id, **kwargs):
        transfer_sudo = request.env['event.registration.transfer'].sudo().browse(transfer_id).exists()
        partner = request.env.user.partner_id
        if (not transfer_sudo or transfer_sudo.recipient_partner_id != partner
                or transfer_sudo.registration_id.partner_id != partner):
            raise NotFound()
        try:
            transfer_sudo.action_return()
        except UserError:
            return request.redirect('/my/events?transfer=error')
        return request.redirect('/my/events?transfer=returned')

    @route('/event/transfer/<int:transfer_id>', type='http', auth='public', website=True)
    def portal_registration_transfer_page(self, transfer_id, access_token=None, **kwargs):
        transfer_sudo = self._get_transfer_from_token_sudo(transfer_id, access_token)
        return self._render_transfer_accept_page(transfer_sudo, access_token)

    @route('/event/transfer/<int:transfer_id>/accept', type='http', auth='public', website=True,
           methods=['POST'])
    def portal_registration_transfer_accept(self, transfer_id, access_token=None, **kwargs):
        transfer_sudo = self._get_transfer_from_token_sudo(transfer_id, access_token)
        try:
            transfer_sudo.action_accept()
        except UserError as e:
            return self._render_transfer_accept_page(transfer_sudo, access_token, error=e.args[0])
        return self._render_transfer_accept_page(transfer_sudo, access_token)

    def _get_transfer_from_token_sudo(self, transfer_id, access_token):
        try:
            return self._document_check_access('event.registration.transfer', transfer_id, access_token)
        except (AccessError, MissingError):
            raise NotFound()

    def _render_transfer_accept_page(self, transfer_sudo, access_token, error=False):
        return request.render('event_registration_transfer.portal_registration_transfer_accept', {
            'transfer': transfer_sudo,
            'access_token': access_token,
            'error': error,
        })
