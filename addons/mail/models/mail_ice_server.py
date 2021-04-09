# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

from twilio.rest import Client


class MailIceServer(models.Model):
    _name = 'mail.ice.server'
    _description = 'ICE server'

    type = fields.Selection([('stun', 'stun:'), ('turn', 'turn:')],
                            string='Type', required=True, default='stun')
    uri = fields.Char('URI', required=True)
    username = fields.Char()
    credential = fields.Char()

    def get_local_ice_servers(self):
        """
        :return: List of up to 5 dict, each of which representing a stun or turn server
        """
        # firefox has a hard cap of 5 ice servers
        ice_servers = self.search_read([], ['type', 'uri', 'username', 'credential'], limit=5)
        formatted_ice_servers = []
        for ice_server in ice_servers:
            formatted_ice_server = {
                'urls': '%s:%s' % (ice_server['type'], ice_server['uri']),
            }
            if ice_server['username']:
                formatted_ice_server['username'] = ice_server['username']
            if ice_server['credential']:
                formatted_ice_server['credential'] = ice_server['credential']
            formatted_ice_servers.append(formatted_ice_server)
        return formatted_ice_servers

    def _get_twilio_credentials(self):
        """ To be overridable by the Saas [comment may be superfluous].

        :return: tuple
        """
        account_sid = self.env['ir.config_parameter'].sudo().get_param('mail.twilio_account_sid')
        auth_token = self.env['ir.config_parameter'].sudo().get_param('mail.twilio_account_token')
        return account_sid, auth_token

    def _get_ice_servers(self):
        """
        :return: List of dict, each of which representing a stun or turn server,
                formatted as expected by the specifications of RTCConfiguration.iceServers
        """
        if self.env['ir.config_parameter'].sudo().get_param('mail.use_twilio_rtc_servers'):
            (account_sid, auth_token) = self._get_twilio_credentials()
            if account_sid and auth_token:
                client = Client(account_sid, auth_token)
                token = client.tokens.create()
                if token:
                    return token.ice_servers
        return self.get_local_ice_servers()
