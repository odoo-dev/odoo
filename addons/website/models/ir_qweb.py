# Part of Odoo. See LICENSE file for full copyright and licensing details.
import re

from collections import OrderedDict
from urllib.parse import urlsplit

from markupsafe import Markup

from odoo import models
from odoo.http import request
from odoo.addons.website.tools import add_form_signature


re_background_image = re.compile(r"(background-image\s*:\s*url\(\s*['\"]?\s*)([^)'\"]+)")
re_translate_span = re.compile(r'<span.+?data-oe-translation-source-sha.+?>(.+?)</span>')

# types of the attribute values whose post-processing can be cached, see `_post_processing_att`
CACHEABLE_ATT_TYPES = frozenset({str, Markup, int, float, bool, type(None)})


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
        if not self._is_static_node(element, compile_context):
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

    def _pre_processing_att(self, attrib):
        self._copy_translate_attributes(attrib)
        super()._pre_processing_att(attrib)

    def _copy_translate_attributes(self, atts):
        """
        In translation mode, store `***.translate` attributes into a sibling
        attribute `data-oe-translate-***`. This is necessary for attributes that
        expect a value in a specific format (e.g. `src` which needs a URL) and
        cannot keep the translation span (see `translate_func`) in the HTML
        output. Other attributes can also take advantage of it.
        """
        if self.env.website and self.env.context.get('edit_translations'):
            for att, value in list(atts.items()):
                if att.endswith('.translate'):
                    match = re.search(re_translate_span, value)
                    if match:
                        atts['data-oe-translate-{}'.format(att.removesuffix('.translate'))] = value
                        atts[att] = match.group(1)

    def _post_processing_att(self, tagName, atts):
        key = self._get_post_processing_att_cache_key(tagName, atts)
        if key is None:
            return self._post_process_website_att(tagName, atts)
        # The registry cache is used directly rather than through `api.ormcache`:
        # this is called hundreds of times per page, and the statistics kept by
        # `ormcache` on each lookup cost as much as the post-processing itself.
        cache = self.env.transaction.ormcaches__['templates.attrs']
        items = cache.get(key)
        if items is None:
            items = cache[key] = tuple(self._post_process_website_att(tagName, atts).items())
        return dict(items)

    def _get_post_processing_att_cache_key(self, tagName, atts):
        """ Return the key under which the post-processing of the attributes of
        a dynamic node is cached, or ``None`` if it must not be cached.

        The result only depends on the website, the template options, the debug
        mode, whether third-party trackers are removed, and the attributes
        themselves: it is the same for every page, visitor and record rendering
        those attributes. Not cached: static nodes (post-processed once, at
        compile time), values that are not plain values (e.g. the lazy content
        of a ``t-set``), and URLs resolved against the current path.
        """
        if not request or atts.get('__is_static_node') or atts.get('data-no-post-process'):
            return None
        only_strings = True
        for value in atts.values():
            value_type = type(value)
            if value_type is not str and value_type is not Markup:
                if value_type not in CACHEABLE_ATT_TYPES:
                    return None
                only_strings = False
        url = atts.get(self.URL_ATTRS.get(tagName))
        if isinstance(url, str) and self._is_path_relative_url(url):
            return None  # `_url_for` joins it with the current path
        if 'background-image' in str(atts.get('style') or ''):
            return None  # the URLs of the style are rewritten as well
        return (
            self._get_post_processing_att_env_key(),
            bool(request.session.debug),
            tagName,
            tuple(atts.items()),
            # 1, 1.0 and True are equal keys, but are not rendered the same
            None if only_strings else tuple(map(type, atts.values())),
        )

    def _get_post_processing_att_env_key(self):
        """ Return the part of the cache key of `_post_processing_att` that
        depends on the environments: the rendering one, and the one of the
        request, whose language and website are used to rewrite the URLs. It
        is computed once per pair of environments and transaction.
        """
        env, request_env = self.env, request.env
        env_keys = env.cr.cache.setdefault('website.post_processing_att', {})
        key = env_keys.get((env, request_env))
        if key is None:
            website = env.website
            context = env.context
            key = env_keys[env, request_env] = (
                website.id,
                bool(website) and website._should_remove_third_party_trackers(),
                tuple(context.get(name) for name in self._get_template_cache_keys()),
                context.get('rendering_bundle'),
                context.get('debug'),
                request_env.context.get('lang'),
                request_env.website.id,
            )
        return key

    @staticmethod
    def _is_path_relative_url(url):
        try:
            parts = urlsplit(url.strip())
        except ValueError:
            return False
        return not parts.scheme and not parts.netloc and bool(parts.path) and not parts.path.startswith('/')

    def _post_process_website_att(self, tagName, atts):
        if atts.get('data-no-post-process'):
            return atts

        atts = super()._post_processing_att(tagName, atts)

        website = self.env.website
        if website and tagName == 'img' and 'loading' not in atts:
            atts['loading'] = 'lazy'  # default is auto

        if self.env.context.get('inherit_branding') or self.env.context.get('rendering_bundle') or \
           self.env.context.get('edit_translations') or self.env.context.get('debug') or (request and request.session.debug):
            return atts

        if not website:
            return atts

        if website._should_remove_third_party_trackers():
            website._remove_third_party_trackers(tagName, atts, ['domains', 'classes'])

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
