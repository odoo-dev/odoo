# -*- coding: utf-8 -*-

from odoo import models, fields, api

from suds.client import Client

class PacMixin(models.Model):
    _name = 'l10n_mx_edi.pacmixin'

    #---------------------------------------------------------------------------            
    # Solucion Factible PAC
    #---------------------------------------------------------------------------   

    @api.multi
    def _l10n_mx_edi_get_pac_infos_solfact(self, company_id, url_type=None):
        test = company_id.l10n_mx_edi_pac_test_env
        username = company_id.l10n_mx_edi_pac_username
        password = company_id.l10n_mx_edi_pac_password
        url = 'https://testing.solucionfactible.com/ws/services/Timbrado?wsdl'\
            if test else 'https://solucionfactible.com/ws/services/Timbrado?wsdl'
        return {
            'url': url,
            'username': 'testing@solucionfactible.com' if test else username,
            'password': 'timbrado.SF.16672' if test else password,
        }

    #---------------------------------------------------------------------------
    # Finkok PAC
    #---------------------------------------------------------------------------

    @api.multi
    def _l10n_mx_edi_get_pac_infos_finkok(self, company_id, url_type=None):
        test = company_id.l10n_mx_edi_pac_test_env
        username = company_id.l10n_mx_edi_pac_username
        password = company_id.l10n_mx_edi_pac_password
        url = 'http://demo-facturacion.finkok.com/servicios/soap/stamp.wsdl'\
            if test else 'http://facturacion.finkok.com/servicios/soap/stamp.wsdl'
        return {
            'url': url,
            'username': 'cfdi@vauxoo.com' if test else username,
            'password': 'vAux00__' if test else password,
        }

    #---------------------------------------------------------------------------            
    # Common methods
    #---------------------------------------------------------------------------   

    @api.multi
    def l10n_mx_edi_get_suds_client(self, company_id, url_type=None):
        pac_name = company_id.l10n_mx_edi_pac
        if not pac_name:
            return {'error': _('No PAC specified')}
        infos_func = '_l10n_mx_edi_get_pac_infos_' + pac_name
        if not hasattr(self, infos_func):
            return {'error': _('Method %s not found') % infos_func}
        infos = getattr(self, infos_func)(company_id, url_type)
        url = infos.pop('url', None)
        username = infos.pop('username', None)
        password = infos.pop('password', None)
        error = infos.pop('error', None)
        if error:
            return {'error': error}
        if not url or not username or not password:
            return {'error': _('Some credentials are missing')}
        try:
            client = Client(url, timeout=20)
            return {'client': client, 'username': username, 'password': password}
        except Exception as e:
            return {'error': _('Failed to call the suds client: %s' % str(e))}

    @api.multi
    def l10n_mx_edi_get_suds_response(self, service, params, client):
        if not hasattr(client.service, service):
            return {'error': _('Service %s not found') % service}
        service_func = getattr(client.service, service)
        try:
            return {'response': service_func(*params)}
        except Exception as e:
            return {'error': _('Failed to process the response: %s' % str(e))}    
