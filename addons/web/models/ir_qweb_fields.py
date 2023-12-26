# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib
from collections import OrderedDict
from werkzeug.urls import url_quote
from markupsafe import Markup

from odoo import api, models, fields
from odoo.tools import pycompat
from odoo.tools import html_escape as escape


class Image(models.AbstractModel):
    """
    Widget options:

    ``class``
        set as attribute on the generated <img> tag
    """
    _name = 'ir.qweb.field.image'
    _description = 'Qweb Field Image'
    _inherit = 'ir.qweb.field.image'

    def _get_src_urls(self, record, field_name, options):
        """Considering the rendering options, returns the src and data-zoom-image urls.

        :return: src, src_zoom urls
        :rtype: tuple
        """
        max_size = None
        if options.get('resize'):
            max_size = options.get('resize')
        else:
            max_width, max_height = options.get('max_width', 0), options.get('max_height', 0)
            if max_width or max_height:
                max_size = '%sx%s' % (max_width, max_height)

        sha = hashlib.sha512(str(getattr(record, 'write_date', fields.Datetime.now())).encode('utf-8')).hexdigest()[:7]
        max_size = '' if max_size is None else '/%s' % max_size

        if options.get('filename-field') and getattr(record, options['filename-field'], None):
            filename = record[options['filename-field']]
        elif options.get('filename'):
            filename = options['filename']
        else:
            filename = record.display_name
        filename = (filename or 'name').replace('/', '-').replace('\\', '-').replace('..', '--')

        src = '/web/image/%s/%s/%s%s/%s?unique=%s' % (record._name, record.id, options.get('preview_image', field_name), max_size, url_quote(filename), sha)

        src_zoom = None
        if options.get('zoom') and getattr(record, options['zoom'], None):
            src_zoom = '/web/image/%s/%s/%s%s/%s?unique=%s' % (record._name, record.id, options['zoom'], max_size, url_quote(filename), sha)
        elif options.get('zoom'):
            src_zoom = options['zoom']

        return src, src_zoom

    @api.model
    def record_to_html(self, record, field_name, options):
        assert options['tagName'] != 'img',\
            "Oddly enough, the root tag of an image field can not be img. " \
            "That is because the image goes into the tag, or it gets the " \
            "hose again."

        if options.get('qweb_img_raw_data', False):
            return super(Image, self).record_to_html(record, field_name, options)

        aclasses = ['img', 'img-fluid'] if options.get('qweb_img_responsive', True) else ['img']
        aclasses += options.get('class', '').split()
        classes = ' '.join(map(escape, aclasses))

        src, src_zoom = self._get_src_urls(record, field_name, options)

        if options.get('alt-field') and getattr(record, options['alt-field'], None):
            alt = escape(record[options['alt-field']])
        elif options.get('alt'):
            alt = options['alt']
        else:
            alt = escape(record.display_name)

        itemprop = None
        if options.get('itemprop'):
            itemprop = options['itemprop']

        atts = OrderedDict()
        atts["src"] = src
        atts["itemprop"] = itemprop
        atts["class"] = classes
        atts["style"] = options.get('style')
        atts["width"] = options.get('width')
        atts["height"] = options.get('height')
        atts["alt"] = alt
        atts["data-zoom"] = src_zoom and u'1' or None
        atts["data-zoom-image"] = src_zoom
        atts["data-no-post-process"] = options.get('data-no-post-process')

        atts = self.env['ir.qweb']._post_processing_att('img', atts)

        img = ['<img']
        for name, value in atts.items():
            if value:
                img.append(' ')
                img.append(escape(pycompat.to_text(name)))
                img.append('="')
                img.append(escape(pycompat.to_text(value)))
                img.append('"')
        img.append('/>')

        return Markup(''.join(img))

class ImageUrlConverter(models.AbstractModel):
    _description = 'Qweb Field Image'
    _inherit = 'ir.qweb.field.image_url'

    def _get_src_urls(self, record, field_name, options):
        image_url = record[options.get('preview_image', field_name)]
        return image_url, options.get("zoom", None)


class File(models.AbstractModel):
    """
    Widget options:

    ``class``
        set as attribute on the generated <a> tag
    """
    _name = 'ir.qweb.field.file'
    _description = 'Qweb Field Image'
    _inherit = 'ir.qweb.field'

    @api.model
    def record_to_html(self, record, field_name, options):
        if record[field_name]:

            aclasses = ['btn', 'btn-link', 'lh-1']
            aclasses += options.get('class', '').split()
            classes = ' '.join(map(escape, aclasses))

            href = '/web/content/%s/%s/%s/%s?download=true' % (record._name, record.id, field_name.replace("_filename", ""), record[field_name])

            itemprop = None
            if options.get('itemprop'):
                itemprop = options['itemprop']

            atts = OrderedDict()
            atts["href"] = href
            atts["class"] = classes
            atts["itemprop"] = itemprop
            atts["data-tooltip"] = "Download"
            atts["aria-label"] = "Download"

            atts = self.env['ir.qweb']._post_processing_att('a', atts)

            download_btn = [record[field_name], "<a"]
            for name, value in atts.items():
                if value:
                    download_btn.append(' ')
                    download_btn.append(escape(pycompat.to_text(name)))
                    download_btn.append('="')
                    download_btn.append(escape(pycompat.to_text(value)))
                    download_btn.append('"')
            download_btn.append('><i class="fa fa-download"></i></a>')

            return Markup(''.join(download_btn))
