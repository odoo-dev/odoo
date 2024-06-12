

import uuid
from base64 import b64decode
from datetime import datetime

from odoo import _, http, tools
from odoo.addons.html_editor.tools import get_video_url_data
from odoo.exceptions import AccessError, MissingError, UserError
from odoo.http import Response, request
from odoo.tools.mimetypes import guess_mimetype

from ..models.ir_attachment import SUPPORTED_IMAGE_MIMETYPES


def get_existing_attachment(IrAttachment, vals):
    """
    Check if an attachment already exists for the same vals. Return it if
    so, None otherwise.
    """
    fields = dict(vals)
    # Falsy res_id defaults to 0 on attachment creation.
    fields['res_id'] = fields.get('res_id') or 0
    raw, datas = fields.pop('raw', None), fields.pop('datas', None)
    domain = [(field, '=', value) for field, value in fields.items()]
    if fields.get('type') == 'url':
        if 'url' not in fields:
            return None
        domain.append(('checksum', '=', False))
    else:
        if not (raw or datas):
            return None
        domain.append(('checksum', '=', IrAttachment._compute_checksum(raw or b64decode(datas))))
    return IrAttachment.search(domain, limit=1) or None


class HTML_Editor(http.Controller):

    def _clean_context(self):
        # avoid allowed_company_ids which may erroneously restrict based on website
        context = dict(request.context)
        context.pop('allowed_company_ids', None)
        request.update_env(context=context)

    def _attachment_create(self, name='', data=False, url=False, res_id=False, res_model='ir.ui.view'):
        """Create and return a new attachment."""
        IrAttachment = request.env['ir.attachment']

        if name.lower().endswith('.bmp'):
            # Avoid mismatch between content type and mimetype, see commit msg
            name = name[:-4]

        if not name and url:
            name = url.split("/").pop()

        if res_model != 'ir.ui.view' and res_id:
            res_id = int(res_id)
        else:
            res_id = False

        attachment_data = {
            'name': name,
            'public': res_model == 'ir.ui.view',
            'res_id': res_id,
            'res_model': res_model,
        }

        if data:
            attachment_data['raw'] = data
            if url:
                attachment_data['url'] = url
        elif url:
            attachment_data.update({
                'type': 'url',
                'url': url,
            })
        else:
            raise UserError(_("You need to specify either data or url to create an attachment."))

        # Despite the user having no right to create an attachment, he can still
        # create an image attachment through some flows
        if (
            not request.env.is_admin()
            and IrAttachment._can_bypass_rights_on_media_dialog(**attachment_data)
        ):
            attachment = IrAttachment.sudo().create(attachment_data)
            # When portal users upload an attachment with the wysiwyg widget,
            # the access token is needed to use the image in the editor. If
            # the attachment is not public, the user won't be able to generate
            # the token, so we need to generate it using sudo
            if not attachment_data['public']:
                attachment.sudo().generate_access_token()
        else:
            attachment = get_existing_attachment(IrAttachment, attachment_data) \
                or IrAttachment.create(attachment_data)

        return attachment

    @http.route(['/web_editor/video_url/data','/html_editor/video_url/data'], type='json', auth='user', website=True)
    def video_url_data(self, video_url, autoplay=False, loop=False,
                       hide_controls=False, hide_fullscreen=False, hide_yt_logo=False,
                       hide_dm_logo=False, hide_dm_share=False):
        return get_video_url_data(
            video_url, autoplay=autoplay, loop=loop,
            hide_controls=hide_controls, hide_fullscreen=hide_fullscreen,
            hide_yt_logo=hide_yt_logo, hide_dm_logo=hide_dm_logo,
            hide_dm_share=hide_dm_share
        )

    @http.route(['/web_editor/attachment/add_data','/html_editor/attachment/add_data'], type='json', auth='user', methods=['POST'], website=True)
    def add_data(self, name, data, is_image, quality=0, width=0, height=0, res_id=False, res_model='ir.ui.view', **kwargs):
        data = b64decode(data)
        if is_image:
            format_error_msg = _("Uploaded image's format is not supported. Try with: %s", ', '.join(SUPPORTED_IMAGE_MIMETYPES.values()))
            try:
                data = tools.image_process(data, size=(width, height), quality=quality, verify_resolution=True)
                mimetype = guess_mimetype(data)
                if mimetype not in SUPPORTED_IMAGE_MIMETYPES:
                    return {'error': format_error_msg}
                if not name:
                    name = '%s-%s%s' % (
                        datetime.now().strftime('%Y%m%d%H%M%S'),
                        str(uuid.uuid4())[:6],
                        SUPPORTED_IMAGE_MIMETYPES[mimetype],
                    )
            except UserError:
                # considered as an image by the browser file input, but not
                # recognized as such by PIL, eg .webp
                return {'error': format_error_msg}
            except ValueError as e:
                return {'error': e.args[0]}

        self._clean_context()
        attachment = self._attachment_create(name=name, data=data, res_id=res_id, res_model=res_model)
        return attachment._get_media_info()

    @http.route(['/web_editor/attachment/add_url', '/html_editor/attachment/add_url'] , type='json', auth='user', methods=['POST'], website=True)
    def add_url(self, url, res_id=False, res_model='ir.ui.view', **kwargs):
        self._clean_context()
        attachment = self._attachment_create(url=url, res_id=res_id, res_model=res_model)
        return attachment._get_media_info()
