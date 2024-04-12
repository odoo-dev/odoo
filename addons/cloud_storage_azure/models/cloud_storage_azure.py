# Part of Odoo. See LICENSE file for full copyright and licensing details.

import re
import requests
from datetime import datetime, timedelta, date
from urllib.parse import unquote, quote

from odoo import models, fields, _
from odoo.exceptions import ValidationError
from odoo.tools import ormcache

from .cloud_storage_azure_utils import generate_blob_sas, get_user_delegation_key


class CloudStorageAzure(models.AbstractModel):
    _inherit = 'cloud.storage.provider'
    _description = 'Azure Cloud Storage'

    _cloud_storage_type = 'cloud_storage_azure'
    _url_pattern = re.compile(r"[^/]+//(?P<account_name>[\w]+).[^/]+/(?P<container_name>[\w]+)/(?P<blob_name>[^?]+)")

    def _get_info_from_url(self, url):
        match = self._url_pattern.match(url)
        return {
            'account_name': match.group('account_name'),
            'container_name': match.group('container_name'),
            'blob_name': unquote(match.group('blob_name')),
        }

    def _get_user_delegation_key(self):
        """ re-generate user_delegation_key every week which won't expire before regeneration """
        today = date.today()
        return self._generate_user_delegation_key(today - timedelta(days=today.weekday()))

    @ormcache('unique_key')
    def _generate_user_delegation_key(self, unique_key):
        key_start_time = datetime.utcnow()
        key_expiry_time = key_start_time + timedelta(days=7)
        return get_user_delegation_key(
            tenant_id=self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_tenant_id'),
            client_id=self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_client_id'),
            client_secret=self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_client_secret'),
            account_name=self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_account_name'),
            key_start_time=key_start_time,
            key_expiry_time=key_expiry_time,
        )

    def _generate_sas_url(self, container_name, blob_name, **kwargs):
        account_name = self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_account_name')
        if 'expiry' not in kwargs:
            kwargs['expiry'] = datetime.utcnow() + timedelta(seconds=300)
        if 'permission' not in kwargs:
            kwargs['permission'] = 'r'
        token = generate_blob_sas(
            account_name=account_name,
            user_delegation_key=self._get_user_delegation_key(),
            container_name=container_name,
            blob_name=blob_name,
            **kwargs
        )

        return f"https://{account_name}.blob.core.windows.net/{container_name}/{quote(blob_name)}?{token}"

    # OVERRIDES
    def _setup(self):
        # check blob create and delete permission
        container_name = self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_container_name')
        blob_name = '0/abc~_ *@ ¥®°²Æçéðπ⁉€∇⓵▲☑♂♥✓➔『にㄅ㊀中한︸🌈🌍👌😀-3.txt'

        upload_url = self._generate_sas_url(container_name, blob_name, permission='c')
        upload_response = requests.put(upload_url, data=b'', headers={'x-ms-blob-type': 'BlockBlob'}, timeout=5)
        if upload_response.status_code != 201:
            raise ValidationError(_('The connection string is not allowed to upload a file to the container.\n%s', str(upload_response.text)))

        delete_url = self._generate_sas_url(container_name, blob_name, permission='d')
        delete_response = requests.delete(delete_url, timeout=5)
        if delete_response.status_code != 202:
            raise ValidationError(_('The connection string is not allowed to delete a blob from the container.\n%s', str(delete_response.text)))

        # promise the sas url can be matched correctly
        url = self._generate_sas_url(container_name, blob_name)
        try:
            info = self._get_info_from_url(url)
            assert info['account_name'] == self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_account_name')
            assert info['container_name'] == container_name
            assert info['blob_name'] == blob_name
        except Exception as e:
            raise ValidationError(_('The sas url cannot be matched correctly. %s', str(e)))

    def _is_configured(self):
        return all((
            self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_container_name'),
            self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_account_name'),
            self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_tenant_id'),
            self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_client_id'),
            self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_client_secret'),
        ))

    def _generate_url(self, attachment):
        account_name = self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_account_name')
        container_name = self.env['ir.config_parameter'].sudo().get_param('cloud_storage_azure_container_name')
        blob_name = self._generate_blob_name(attachment)
        return f"https://{account_name}.blob.core.windows.net/{container_name}/{quote(blob_name)}"

    def _generate_download_info(self, attachment):
        info = self._get_info_from_url(attachment.url)
        time_to_expiry = 300
        expiry = datetime.utcnow() + timedelta(seconds=time_to_expiry)
        return {
            'url': self._generate_sas_url(info['container_name'], info['blob_name'], permission='r', expiry=expiry, cache_control='private, max-age=300'),
            'time_to_expiry': time_to_expiry,
        }

    def _generate_upload_info(self, attachment):
        info = self._get_info_from_url(attachment.url)
        time_to_expiry = 300
        expiry = datetime.utcnow() + timedelta(seconds=time_to_expiry)
        url = self._generate_sas_url(info['container_name'], info['blob_name'], permission='c', expiry=expiry)
        return {
            'url': url,
            'method': 'PUT',
            'headers': {
                'x-ms-blob-type': 'BlockBlob',
            },
        }

    def _delete_blobs(self, blobs):
        to_unlink_ids = []
        for blob in blobs:
            info = self._get_info_from_url(blob.url)
            url = self._generate_sas_url(info['container_name'], info['blob_name'], permission='d')
            response = requests.delete(url, timeout=5)
            if response.status_code != 202 and response.status_code != 404:
                blob.write({
                    'state': 'failed',
                    'error_message': f'Error: {response.text}',
                })
            else:
                to_unlink_ids.append(blob.id)
        self.env['cloud.storage.blob.to.delete'].browse(to_unlink_ids).unlink()


class CloudStorageAttachment(models.Model):
    _inherit = 'ir.attachment'

    type = fields.Selection(
        selection_add=[(CloudStorageAzure._cloud_storage_type, CloudStorageAzure._description)],
        ondelete={CloudStorageAzure._cloud_storage_type: lambda recs: recs.write({'type': 'url'})}
    )
