# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re

from collections import OrderedDict
from urllib.parse import urlsplit

from odoo import models
from odoo.http import request
from odoo.tools import lazy
from odoo.addons.website.tools import add_form_signature
from odoo.exceptions import AccessError


re_background_image = re.compile(r"(background-image\s*:\s*url\(\s*['\"]?\s*)([^)'\"]+)")


class IrQweb(models.AbstractModel):
    """ IrQweb object for rendering stuff in the website context """

    _inherit = 'ir.qweb'

    URL_ATTRS = {
        'form': 'action',
        'a': 'href',
        'link': 'href',
        'script': 'src',
        'img': 'src',
    }

    def _compile_root(self, element, compile_context):
        # Removes the attributes used by the "/website/snippet/filter_templates"
        # controller and used only to be filtered without using irQweb rendering
        for data_filter in [
                'data-number-of-elements', 'data-number-of-elements-sm',
                'data-number-of-elements-fetch', 'data-row-per-slide',
                'data-arrow-position', 'data-extra-classes',
                'data-extra-snippet-classes', 'data-container-classes',
                'data-content-classes', 'data-column-classes', 'data-thumb',
            ]:
            element.attrib.pop(data_filter, None)
        return super()._compile_root(element, compile_context)

    def _get_template(self, template):
        element, document, ref = super()._get_template(template)
        if self.env.context.get('website_id'):
            add_form_signature(element, self.sudo().env)
        return element, document, ref

    # assume cache will be invalidated by third party on write to ir.ui.view
    def _get_template_cache_keys(self):
        """ Return the list of context keys to use for caching ``_compile``. """
        return super()._get_template_cache_keys() + ['website_id', 'cookies_allowed']

    def _post_processing_att(self, tagName, atts):
        if atts.get('data-no-post-process'):
            return atts

        atts = super()._post_processing_att(tagName, atts)

        website = self.env['website'].get_current_website(fallback=False)
        if website and tagName == 'img' and 'loading' not in atts:
            atts['loading'] = 'lazy'  # default is auto

        if self.env.context.get('inherit_branding') or self.env.context.get('rendering_bundle') or \
           self.env.context.get('edit_translations') or self.env.context.get('debug') or (request and request.session.debug):
            return atts

        if not website:
            return atts

        if (
            website.cookies_bar
            and website.block_third_party_domains
            and not self.env.context.get('cookies_allowed')
            and not self.env.user.has_group('website.group_website_restricted_editor')
        ):
            # If the cookie banner is activated, 3rd-party embedded iframes and
            # scripts should be controlled. As such:
            # - 'domains' is a watchlist on the iframe/script's src itself,
            # - 'classes' is a watchlist on container elements in which iframes
            # are/could be built on the fly client-side for some reason.
            cookies_watchlist = {
                'domains': website.blocked_third_party_domains.split('\n'),
                'classes': website._get_blocked_iframe_containers_classes(),
            }
            remove_src = False
            if tagName in ('iframe', 'script'):
                src_host = urlsplit((atts.get('src') or '').lower()).hostname
                if src_host:
                    remove_src = any(
                        # "www.example.com" and "example.com" should block both.
                        src_host == domain.removeprefix('www.')
                        # "domain.com" should block "subdomain.domain.com", but
                        # not "(subdomain.)mydomain.com".
                        or src_host.endswith('.' + domain.removeprefix('www.'))
                        for domain in cookies_watchlist['domains']
                    )
            if (
                remove_src
                or cookies_watchlist['classes'].intersection((atts.get('class') or '').split(' '))
            ):
                atts['data-need-cookies-approval'] = 'true'
                # Case class in watchlist: we stop here. The element could
                # contain an iframe created on the fly client-side. It is marked
                # now so that the iframe can be marked later when created.
                # Case iframe/script's src in watchlist: we adapt the src.
                if 'src' in atts:
                    atts['data-nocookie-src'] = atts['src']
                    atts['src'] = 'about:blank'

        name = self.URL_ATTRS.get(tagName)
        if request:
            value = atts.get(name) if name else None
            if value not in (None, False, ()):
                atts[name] = self.env['ir.http']._url_for(str(value))

            # Adapt background-image URL in the same way as image src.
            atts = self._adapt_style_background_image(atts, self.env['ir.http']._url_for)

        if not website.cdn_activated:
            return atts

        data_name = f'data-{name}'
        if name and (name in atts or data_name in atts):
            atts = OrderedDict(atts)
            if name in atts and atts[name] not in (False, None, ()):
                atts[name] = website.get_cdn_url(atts[name])
            if data_name in atts and atts[data_name] not in (False, None, ()):
                atts[data_name] = website.get_cdn_url(atts[data_name])
        atts = self._adapt_style_background_image(atts, website.get_cdn_url)

        return atts

    def _adapt_style_background_image(self, atts, url_adapter):
        if isinstance(atts.get('style'), str) and 'background-image' in atts['style']:
            atts['style'] = re_background_image.sub(lambda m: '%s%s' % (m[1], url_adapter(m[2])), atts['style'])
        return atts
