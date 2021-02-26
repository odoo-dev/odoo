# -*- coding: utf-8 -*-
from __future__ import print_function
from textwrap import dedent
import copy
import json
import logging
from collections import OrderedDict
from time import time
import traceback
import threading

from lxml import html
from lxml import etree
from werkzeug import urls

from odoo import api, models, tools
from odoo.tools.safe_eval import check_values, assert_valid_codeobj, _BUILTINS, _SAFE_OPCODES
from odoo.tools.misc import get_lang
from odoo.http import request
from odoo.modules.module import get_resource_path

from odoo.addons.base.models.qweb import QWeb, escape
from odoo.addons.base.models.assetsbundle import AssetsBundle

_logger = logging.getLogger(__name__)

class IrQWeb(models.AbstractModel, QWeb):
    """ Base QWeb rendering engine
    * to customize ``t-field`` rendering, subclass ``ir.qweb.field`` and
      create new models called :samp:`ir.qweb.field.{widget}`
    Beware that if you need extensions or alterations which could be
    incompatible with other subsystems, you should create a local object
    inheriting from ``ir.qweb`` and customize that.
    """

    _name = 'ir.qweb'
    _description = 'Qweb'
    # _cache = {}

    @api.model
    def _render(self, id_or_xml_id, values=None, **options):
        """ render(id_or_xml_id, values, **options)

        Render the template specified by the given name.

        :param id_or_xml_id: name or etree (see get_template)
        :param dict values: template values to be used for rendering
        :param options: used to compile the template (the dict available for the rendering is frozen)
            * ``load`` (function) overrides the load method
            * ``profile`` (Boolean) activate the rendering profile displayed in log as debug
        """

        # optionnal hooks for performance and tracing analysis
        current_thread = threading.current_thread()
        if hasattr(current_thread, 'qweb_hooks'):
            self = self.with_context(profile=True, __render_stack__=traceback.extract_stack())

        # if self.env.user._is_public():
        #     self = self.with_context(use_qweb_cache=True)

        context = dict(self.env.context, dev_mode='qweb' in tools.config['dev_mode'])
        context.update(options)

        result = super(IrQWeb, self)._render(id_or_xml_id, values=values, **context)

        if b'data-pagebreak=' not in result:
            return result

        fragments = html.fragments_fromstring(result.decode('utf-8'))

        for fragment in fragments:
            for row in fragment.iterfind('.//tr[@data-pagebreak]'):
                table = next(row.iterancestors('table'))
                newtable = html.Element('table', attrib=dict(table.attrib))
                thead = table.find('thead')
                if thead:
                    newtable.append(copy.deepcopy(thead))
                # TODO: copy caption & tfoot as well?
                # TODO: move rows in a tbody if row.getparent() is one?

                pos = row.get('data-pagebreak')
                assert pos in ('before', 'after')
                for sibling in row.getparent().iterchildren('tr'):
                    if sibling is row:
                        if pos == 'after':
                            newtable.append(sibling)
                        break
                    newtable.append(sibling)

                table.addprevious(newtable)
                table.addprevious(html.Element('div', attrib={
                    'style': 'page-break-after: always'
                }))

        return b''.join(html.tostring(f) for f in fragments)

    # assume cache will be invalidated by third party on write to ir.ui.view
    def _get_template_cache_keys(self):
        """ Return the list of context keys to use for caching ``_get_template``. """
        return ['lang', 'inherit_branding', 'editable', 'translatable', 'edit_translations', 'website_id', 'profile']

    # apply ormcache_context decorator unless in dev mode...
    @tools.conditional(
        'xml' not in tools.config['dev_mode'],
        tools.ormcache('id_or_xml_id', 'tuple(options.get(k) for k in self._get_template_cache_keys())'),
    )
    def compile(self, id_or_xml_id, options):
        try:
            id_or_xml_id = int(id_or_xml_id)
        except:
            pass
        return super(IrQWeb, self).compile(id_or_xml_id, options=options)

    def _load(self, name, options):
        lang = options.get('lang', get_lang(self.env).code)
        env = self.env
        if lang != env.context.get('lang'):
            env = env(context=dict(env.context, lang=lang))

        view_id = self.env['ir.ui.view'].get_view_id(name)
        template = env['ir.ui.view'].sudo()._read_template(view_id)

        # QWeb's `_read_template` will check if one of the first children of
        # what we send to it has a "t-name" attribute having `name` as value
        # to consider it has found it. As it'll never be the case when working
        # with view ids or children view or children primary views, force it here.
        def is_child_view(view_name):
            view_id = self.env['ir.ui.view'].get_view_id(view_name)
            view = self.env['ir.ui.view'].sudo().browse(view_id)
            return view.inherit_id is not None

        if isinstance(name, int) or is_child_view(name):
            view = etree.fromstring(template)
            for node in view:
                if node.get('t-name'):
                    node.set('t-name', str(name))
            return (view, view_id)
        else:
            return (template, view_id)

    # @classmethod
    # def clear_caches(self):
    #     IrQWeb._cache = {}
    #     super(IrQWeb, self).clear_caches()

    # order

    def _directives_eval_order(self):
        directives = super(IrQWeb, self)._directives_eval_order()
        directives.insert(directives.index('call'), 'lang')
        directives.insert(directives.index('field'), 'call-assets')
        return directives

    # compile directives

    def _compile_directive_lang(self, el, options, indent):
        lang = el.attrib.pop('t-lang', get_lang(self.env).code)
        el.attrib['t-options-lang'] = lang
        return self._compile_node(el, options, indent)

    def _compile_directive_call_assets(self, el, options, indent):
        """ This special 't-call' tag can be used in order to aggregate/minify javascript and css assets"""
        if len(el):
            raise SyntaxError("t-call-assets cannot contain children nodes")

        directive = 't-call-assets="%s"' % el.get('t-call-assets')

        code = self._flushText(indent)
        code.extend(self._compile_start_profiling(el, directive, options, indent))
        code.append(self._indent(dedent("""
            __qweb_t_call_assets_nodes = __qweb_self._get_asset_nodes(%(xmlid)s, __qweb_options, css=%(css)s, js=%(js)s, debug=%(debug)s, async_load=%(async_load)s, defer_load=%(defer_load)s, lazy_load=%(lazy_load)s, values=locals())

            for __qweb_index, (__qweb_tagName, __qweb_attrs, __qweb_content) in enumerate(__qweb_t_call_assets_nodes):
                if __qweb_index:
                    yield u'\n        '
                yield u'<'
                yield __qweb_tagName
                __qweb_self._post_processing_att(__qweb_tagName, __qweb_attrs, __qweb_options)
                for __qweb_name, __qweb_value in __qweb_attrs.items():
                    if __qweb_value or isinstance(__qweb_value, string_types):
                        yield u' '
                        yield __qweb_name
                        yield u'="'
                        yield __qweb_self._compile_str_html(__qweb_to_text((__qweb_value))
                        yield u'"'
                if not __qweb_content and __qweb_tagName in __qweb_self._void_elements:
                    yield u'/>'
                else:
                    yield u'>'
                    if __qweb_content:
                      yield __qweb_content
                    yield u'</'
                    yield __qweb_tagName
                    yield u'>'
            """) % {
                'xmlid': self._compile_str(el.get('t-call-assets')),
                'css': self._compile_bool(el.get('t-css', True)),
                'js': self._compile_bool(el.get('t-js', True)),
                'debug': 'debug', # value in template at runing time
                'async_load': self._compile_bool(el.get('async_load', False)),
                'defer_load': self._compile_bool(el.get('defer_load', False)),
                'lazy_load': self._compile_bool(el.get('lazy_load', False)),
            }, indent))
        code.extend(self._compile_stop_profiling(el, directive, options, indent))

        return code

    # method called by computing code

    def get_asset_bundle(self, xmlid, files, env=None, css=True, js=True):
        return AssetsBundle(xmlid, files, env=env, css=css, js=js)

    def _get_asset_nodes(self, xmlid, options, css=True, js=True, debug=False, async_load=False, defer_load=False, lazy_load=False, values=None):
        """Generates asset nodes.
        If debug=assets, the assets will be regenerated when a file which composes them has been modified.
        Else, the assets will be generated only once and then stored in cache.
        """
        if debug and 'assets' in debug:
            return self._generate_asset_nodes(xmlid, options, css, js, debug, async_load, defer_load, lazy_load, values)
        else:
            return self._generate_asset_nodes_cache(xmlid, options, css, js, debug, async_load, defer_load, lazy_load, values)

    @tools.conditional(
        # in non-xml-debug mode we want assets to be cached forever, and the admin can force a cache clear
        # by restarting the server after updating the source code (or using the "Clear server cache" in debug tools)
        'xml' not in tools.config['dev_mode'],
        tools.ormcache_context('xmlid', 'options.get("lang", "en_US")', 'css', 'js', 'debug', 'async_load', 'defer_load', 'lazy_load', keys=("website_id",)),
    )
    def _generate_asset_nodes_cache(self, xmlid, options, css=True, js=True, debug=False, async_load=False, defer_load=False, lazy_load=False, values=None):
        return self._generate_asset_nodes(xmlid, options, css, js, debug, async_load, defer_load, lazy_load, values)

    def _generate_asset_nodes(self, xmlid, options, css=True, js=True, debug=False, async_load=False, defer_load=False, lazy_load=False, values=None):
        files, remains = self._get_asset_content(xmlid, options)
        asset = self.get_asset_bundle(xmlid, files, env=self.env, css=css, js=js)
        remains = [node for node in remains if (css and node[0] == 'link') or (js and node[0] != 'link')]
        return remains + asset.to_node(css=css, js=js, debug=debug, async_load=async_load, defer_load=defer_load, lazy_load=lazy_load)

    def _get_asset_link_urls(self, xmlid, options):
        asset_nodes = self._get_asset_nodes(xmlid, options, js=False)
        return [node[1]['href'] for node in asset_nodes if node[0] == 'link']

    @tools.ormcache_context('xmlid', 'options.get("lang", "en_US")', keys=("website_id",))
    def _get_asset_content(self, xmlid, options):
        options = dict(options,
            inherit_branding=False, inherit_branding_auto=False,
            edit_translations=False, translatable=False,
            rendering_bundle=True)

        options['website_id'] = self.env.context.get('website_id')
        IrQweb = self.env['ir.qweb'].with_context(options)

        def can_aggregate(url):
            return not urls.url_parse(url).scheme and not urls.url_parse(url).netloc and not url.startswith('/web/assets')

        # TODO: This helper can be used by any template that wants to embedd the backend.
        #       It is currently necessary because the ir.ui.view bundle inheritance does not
        #       match the module dependency graph.
        def get_modules_order():
            if request:
                from odoo.addons.web.controllers.main import module_boot
                return json.dumps(module_boot())
            return '[]'
        template = IrQweb._render(xmlid, {"get_modules_order": get_modules_order})

        files = []
        remains = []
        for el in html.fragments_fromstring(template):
            if isinstance(el, html.HtmlElement):
                href = el.get('href', '')
                src = el.get('src', '')
                atype = el.get('type')
                media = el.get('media')

                if can_aggregate(href) and (el.tag == 'style' or (el.tag == 'link' and el.get('rel') == 'stylesheet')):
                    if href.endswith('.sass'):
                        atype = 'text/sass'
                    elif href.endswith('.scss'):
                        atype = 'text/scss'
                    elif href.endswith('.less'):
                        atype = 'text/less'
                    if atype not in ('text/less', 'text/scss', 'text/sass'):
                        atype = 'text/css'
                    path = [segment for segment in href.split('/') if segment]
                    filename = get_resource_path(*path) if path else None
                    files.append({'atype': atype, 'url': href, 'filename': filename, 'content': el.text, 'media': media})
                elif can_aggregate(src) and el.tag == 'script':
                    atype = 'text/javascript'
                    path = [segment for segment in src.split('/') if segment]
                    filename = get_resource_path(*path) if path else None
                    files.append({'atype': atype, 'url': src, 'filename': filename, 'content': el.text, 'media': media})
                else:
                    remains.append((el.tag, OrderedDict(el.attrib), el.text))
            else:
                # the other cases are ignored
                pass

        return (files, remains)

    def _get_field(self, record, field_name, expression, tagName, field_options, options, values):
        field = record._fields[field_name]

        # adds template compile options for rendering fields
        field_options['template_options'] = options

        # adds generic field options
        field_options['tagName'] = tagName
        field_options['expression'] = expression
        field_options['type'] = field_options.get('widget', field.type)
        inherit_branding = options.get('inherit_branding', options.get('inherit_branding_auto') and record.check_access_rights('write', False))
        field_options['inherit_branding'] = inherit_branding
        translate = options.get('edit_translations') and options.get('translatable') and field.translate
        field_options['translate'] = translate

        # field converter
        model = 'ir.qweb.field.' + field_options['type']
        converter = self.env[model] if model in self.env else self.env['ir.qweb.field']

        # get content
        content = converter.record_to_html(record, field_name, field_options)
        attributes = converter.attributes(record, field_name, field_options, values)

        return (attributes, content, inherit_branding or translate)

    def _get_widget(self, value, expression, tagName, field_options, options, values):
        # adds template compile options for rendering fields
        field_options['template_options'] = options

        field_options['type'] = field_options['widget']
        field_options['tagName'] = tagName
        field_options['expression'] = expression

        # field converter
        model = 'ir.qweb.field.' + field_options['type']
        converter = self.env[model] if model in self.env else self.env['ir.qweb.field']

        # get content
        content = converter.value_to_html(value, field_options)
        attributes = OrderedDict()
        attributes['data-oe-type'] = field_options['type']
        attributes['data-oe-expression'] = field_options['expression']

        return (attributes, content, None)

    def _start_log_profiling(self, ref, arch, xpath, directive, values, context):
        return (time(), self.env.cr.sql_log_count)

    def _stop_log_profiling(self, ref, arch, xpath, directive, values, context, loginfo):
        now, query = loginfo
        delay = (time() - now) * 1000
        dquery = self.env.cr.sql_log_count - query
        stack = self.env.context.get('__render_stack__')
        log = {
            'view_id': ref,
            'arch': arch,
            'xpath': xpath,
            'directive': directive,
            'now': now,
            'delay': delay,
            'query': dquery,
        }
        if 'log_profiling' in values:
            values['log_profiling'](log)

        # optionnal hooks for performance and tracing analysis
        current_thread = threading.current_thread()
        if hasattr(current_thread, 'qweb_hooks'):
            for hook in current_thread.qweb_hooks:
                hook(self.env.cr, stack, ref, arch, xpath, directive, now, delay, dquery)
        else:
            _logger.debug({
                'ref': ref,
                'xpath': xpath,
                'directive': directive,
                'time': now,
                'delay': delay,
                'query': dquery,
            })

    # def _cache_content(self, options, cache_id, get_value):
    #     if not self.env.context.get('use_qweb_cache'):
    #         return get_value()
    #     ref = options['ref']
    #     if ref not in IrQWeb._cache:
    #         IrQWeb._cache[ref] = {}
    #
    #     if cache_id not in IrQWeb._cache[ref]:
    #         IrQWeb._cache[ref][cache_id] = get_value()
    #     return IrQWeb._cache[ref][cache_id]
    #
    # compile expression add safe_eval

    def _prepare_context(self, default_values, values, options):
        """ Prepare the context that will sent to the evaluation of the
        compiled function. Check if the values received are safe (according to
        safe_eval's semantics) and add the secure '__builtins__' value.

        :param default_values: attributes added to the values for each computed
            template. Contains all extracted value from the template set to
            None constant.
        :param values: template values to be used for rendering
        :param options: frozen dict of compilation parameters.
        """
        default_values.update(request=request, cache_assets=round(time()/180))

        check_values(values)
        globals_dict = super(IrQWeb, self)._prepare_context(default_values, values, options)
        globals_dict['__builtins__'] = _BUILTINS
        return globals_dict

    def _compile_expr(self, expr):
        """ Compiles a purported Python expression to compiled code, verifies
        that it's safe (according to safe_eval's semantics) and alter its
        variable references to access values data instead

        :param expr: string
        """
        assert_valid_codeobj(_SAFE_OPCODES, compile(expr, '<>', 'eval'), expr)
        return super(IrQWeb, self)._compile_expr(expr)

    def _compile_bool(self, attr, default=False):
        if attr:
            if attr is True:
                return True
            attr = attr.lower()
            if attr in ('false', '0'):
                return False
            elif attr in ('true', '1'):
                return True
        return bool(default)
