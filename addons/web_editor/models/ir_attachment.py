# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from werkzeug.urls import url_quote

from odoo import api, models, fields, tools

SUPPORTED_IMAGE_MIMETYPES = ['image/gif', 'image/jpe', 'image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml']
SUPPORTED_VIDEO_MIMETYPES = ['video/mp4']
SUPPORTED_IMAGE_EXTENSIONS = ['.gif', '.jpe', '.jpeg', '.jpg', '.png', '.svg']
SUPPORTED_VIDEO_EXTENSIONS = ['.mp4']


class IrAttachment(models.Model):

    _inherit = "ir.attachment"

    local_url = fields.Char("Attachment URL", compute='_compute_local_url')
    src = fields.Char(compute='_compute_src')
    filetype = fields.Char(compute='_compute_filetype')
    width = fields.Integer(compute='_compute_size')
    height = fields.Integer(compute='_compute_size')
    thumbnail = fields.Binary("Thumbnail", attachment=False)
    original_id = fields.Many2one('ir.attachment', string="Original (unoptimized, unresized) attachment")

    @api.depends('mimetype')
    def _compute_filetype(self):
        for attachment in self:
            # Videos are served from /content/ and images from /images/
            attachment.filetype = 'content' if attachment.mimetype in SUPPORTED_VIDEO_MIMETYPES else 'image'

    def _compute_local_url(self):
        for attachment in self:
            if attachment.url:
                attachment.local_url = attachment.url
            else:
                attachment.local_url = f'/web/{attachment.filetype}/{attachment.id}?unique={attachment.checksum}'

    @api.depends('mimetype', 'url', 'name')
    def _compute_src(self):
        for attachment in self:
            # Only add a src for supported images and videos
            if attachment.mimetype not in SUPPORTED_IMAGE_MIMETYPES + SUPPORTED_VIDEO_MIMETYPES:
                attachment.src = False
                continue

            if attachment.type == 'url':
                attachment.src = attachment.url
            else:
                # Adding unique in URLs for cache-control
                unique = attachment.checksum[:8]
                if attachment.url:
                    # For attachments-by-url, unique is used as a cachebuster. They
                    # currently do not leverage max-age headers.
                    separator = '&' if '?' in attachment.url else '?'
                    attachment.src = f'{attachment.url}{separator}unique={unique}'
                else:
                    name = url_quote(attachment.name)
                    attachment.src = f'/web/{attachment.filetype}/{attachment.id}-{unique}/{name}'

    @api.depends('datas')
    def _compute_size(self):
        for attachment in self:
            try:
                image = tools.base64_to_image(attachment.datas)
                attachment.width = image.width
                attachment.height = image.height
            except Exception:
                # This is either an incompatible image or a video
                attachment.width = 0
                attachment.height = 0


    def _get_media_info(self):
        """Return a dict with the values that we need on the media dialog."""
        self.ensure_one()
        return self._read_format(['id', 'name', 'description', 'mimetype', 'checksum', 'url', 'type', 'res_id', 'res_model', 'public', 'access_token', 'src', 'width', 'height', 'original_id', 'thumbnail'])[0]
