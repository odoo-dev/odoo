# -*- coding: utf-8 -*-
import ast
import logging
import os.path
import re
import traceback
import builtins
import types
from collections import OrderedDict
from itertools import count, chain
from textwrap import dedent, indent as _indent
from time import time

from lxml import etree
from psycopg2.extensions import TransactionRollbackError
import werkzeug
from werkzeug.utils import escape as _escape

from odoo.tools import pycompat, freehash, parse_version

_logger = logging.getLogger(__name__)

####################################
###          qweb tools          ###
####################################

class QWebException(Exception):
    def __init__(self, message, error=None, path=None, html=None, name=None, code=None):
        self.error = error
        self.message = message
        self.path = path
        self.html = html
        self.name = name
        self.code = code
        self.stack = traceback.format_exc()
        if self.error:
            self.message = "%s\n%s: %s" % (self.message, self.error.__class__.__name__, self.error)
        if self.name:
            self.message = "%s\nTemplate: %s" % (self.message, self.name)
        if self.path:
            self.message = "%s\nPath: %s" % (self.message, self.path)
        if self.html:
            self.message = "%s\nNode: %s" % (self.message, self.html)

        super(QWebException, self).__init__(message)

    def __str__(self):
        message = "%s\n%s\n%s" % (self.error, self.stack, self.message)
        if self.code:
            message = "%s\nCompiled code:\n%s" % (message, self.code)
        return message

    def __repr__(self):
        return str(self)

class frozendict(dict):
    """ An implementation of an immutable dictionary. """
    def __delitem__(self, key):
        raise NotImplementedError("'__delitem__' not supported on frozendict")
    def __setitem__(self, key, val):
        raise NotImplementedError("'__setitem__' not supported on frozendict")
    def clear(self):
        raise NotImplementedError("'clear' not supported on frozendict")
    def pop(self, key, default=None):
        raise NotImplementedError("'pop' not supported on frozendict")
    def popitem(self):
        raise NotImplementedError("'popitem' not supported on frozendict")
    def setdefault(self, key, default=None):
        raise NotImplementedError("'setdefault' not supported on frozendict")
    def update(self, *args, **kwargs):
        raise NotImplementedError("'update' not supported on frozendict")
    def __hash__(self):
        return hash(frozenset((key, freehash(val)) for key, val in self.items()))

# Avoid DeprecationWarning while still remaining compatible with werkzeug pre-0.9
escape = (lambda text: _escape(text, quote=True)) if parse_version.parse_version(getattr(werkzeug, '__version__', '0.0')) < parse_version.parse_version('0.9.0') else _escape

unsafe_eval = eval
builtins_names = dir(builtins)

_FORMAT_REGEX = re.compile(r'(?:#\{(.+?)\})|(?:\{\{(.+?)\}\})') # ( ruby-style )|(  jinja-style  )
_VAR_REGEXP = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


####################################
###             QWeb             ###
####################################


class QWeb(object):
    _empty_line = re.compile(r'\n\s*\n')
    __slots__ = ()

    _void_elements = frozenset([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen',
        'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'])
    _name_gen = count()

    def _render(self, template, values=None, **options):
        """ render(template, values, **options, indent=indent)

        Render the template specified by the given name.

        :param template: template identifier
        :param dict values: template values to be used for rendering
        :param options: used to compile the template (the dict available for the rendering is frozen)
            * ``load`` (function) overrides the load method (returns: (template, ref))
            * ``profile`` (boolean) profile the rendering
        """
        values = values or {}

        body = list(self.compile(template, options)(self, values))
        joined = u''.join(body)

        if not values.get('__keep_empty_lines'):
            joined = QWeb._empty_line.sub('\n', joined.strip())

        html = joined.encode('utf8')
        return html

    def compile(self, template, options):
        """ Compile the given template into a rendering function (generator)::

            render(qweb, values)

        where ``qweb`` is a QWeb instance and ``values`` are the values to render.
        """
        if options is None:
            options = {}

        element, document, ref = self.get_template(template, options)
        if not ref:
            ref = element.get('t-name', str(document))

        options['ref'] = ref
        _options = dict(options)
        options = frozendict(options)

        _options['template'] = template
        _options['document'] = document
        _options['root'] = element.getroottree()
        _options['last_path_node'] = None
        if not options.get('nsmap'):
            _options['nsmap'] = {}

        def manage_exception(e, path):
            element = self.get_template(template, options)[0]
            node = None
            if path and ':' not in path:
                node = element.getroottree().xpath(path)
            return QWebException("Error when compiling template code", e, path, node and etree.tostring(node[0], encoding='unicode'), str(ref))

        # generate ast

        try:
            if self._text_concat:
                _logger.debug("A previous rendering fail")
            self._text_concat.clear()

            self._appendText("") # to have at least one yield

            code_lines = ["def template():"] + \
                self._compile_start_profiling(None, None, _options, 1) + \
                self._compile_node(element, _options, 1) + \
                self._compile_stop_profiling(None, None, _options, 1) + \
                self._flushText(1)
            code = u'\n'.join(code_lines)
        except QWebException as e:
            raise e
        except Exception as e:
            path = _options['last_path_node']
            raise manage_exception(e, path)

        # compile code and defined default values

        try:
            # found used value in compiled code to have the default values
            default_values = {}
            st = ast.parse(code)
            for node in ast.walk(st):
                if type(node) is ast.Name and not node.id.startswith('__qweb') and node.id not in builtins_names:
                    default_values[node.id] = None

            compiled = compile(code, '<template>', 'exec')
        except QWebException as e:
            raise e
        except Exception as e:
            path = _options['last_path_node']
            raise manage_exception(e, path)

        default_values['format'] = self._format

        # return the wrapped function

        def _compiled_fn(self, values):
            values['__qweb_0'] = values.pop(0, values.get('__qweb_0', None))
            ctx_values = self._prepare_context(dict(default_values)), values, options)
            try:
                unsafe_eval(compiled, ctx_values)
                yield from ctx_values['template']()
            except (QWebException, TransactionRollbackError) as e:
                raise e
            except Exception as e:
                path = ctx_values['__qweb_log']['last_path_node']
                raise manage_exception(e, path)

        return _compiled_fn

    def get_template(self, template, options):
        """ Retrieve the given template, and return it as a pair ``(element,
        document)``, where ``element`` is an etree, and ``document`` is the
        string document that contains ``element``.
        """
        ref = template
        if isinstance(template, etree._Element):
            element = template
            document = etree.tostring(template)
            return (element, document, template.get('t-name'))
        else:
            try:
                document, ref = options.get('load', self._load)(template, options)
            except QWebException as e:
                raise e
            except Exception as e:
                template = options.get('caller_template', template)
                path = options.get('last_path_node')
                raise QWebException("load could not load template", e, path, name=template)

        if document is None:
            raise QWebException("Template not found", name=template)

        if isinstance(document, etree._Element):
            element = document
            document = etree.tostring(document, encoding=str)
        elif not document.strip().startswith('<') and os.path.exists(document):
            element = etree.parse(document).getroot()
        else:
            element = etree.fromstring(document)

        for node in element:
            if node.get('t-name') == str(template):
                return (node, document, ref)
        return (element, document, ref)

    def _load(self, template, options, indent):
        """ Load a given template. """
        return (template, None)

    # values for running time

    def _prepare_context(self, default_values, values, options):
        globals_dict = dict()
        globals_dict.update(default_values)
        globals_dict['__qweb_0'] = []
        globals_dict.update(values)
        globals_dict['__qweb_self'] = self
        globals_dict['__qweb_GeneratorType'] = types.GeneratorType
        globals_dict['__qweb_OrderedDict'] = OrderedDict
        globals_dict['__qweb_to_text'] = pycompat.to_text
        globals_dict['__qweb_locals'] = locals
        globals_dict['__qweb_import'] = __import__
        def merge_dict(d1, d2):
            d1.update(d2)
            return d1
        globals_dict['__qweb_merged_dict'] = merge_dict
        globals_dict['__qweb_options'] = options
        globals_dict['__qweb_log'] = {'last_path_node': ''}

        return globals_dict

    def _format(self, value, formating, *args, **kwargs):
        format = getattr(self, '_format_func_%s' % formating, None)
        if not format:
            raise ValueError("Unknown format '%s'" % (formating,))
        return format(value, *args, **kwargs)

    # compute helpers

    _text_concat = []
    def _appendText(self, text):
        self._text_concat.append(pycompat.to_text(text))

    def _flushText(self, indent):
        # yield text
        if self._text_concat:
            text = u''.join(self._text_concat)
            self._text_concat.clear()
            return [('    ' * indent) + 'yield """%s"""' % text]
        else:
            return []

    def _indent(self, code, indent):
        return _indent(code, '    ' * indent)

    def _make_name(self, prefix='var'):
        return "%s_%s" % (prefix, next(self._name_gen))

    def _compile_node(self, el, options, indent):
        """ Compile the given element.

        :return: list of AST nodes
        """
        if el.get("groups"):
            el.set("t-groups", el.attrib.pop("groups"))

        # if tag don't have qweb attributes don't use directives
        if self._is_static_node(el, options):
            return self._compile_static_node(el, options, indent=indent)

        path = options['root'].getpath(el)
        if options['last_path_node'] != path:
            options['last_path_node'] = path
            body = [self._indent('__qweb_log["last_path_node"] = "%s"' % self._compile_str(path), indent)]
        else:
            body = []

        # create an iterator on directives to compile in order
        options['iter_directives'] = iter(self._directives_eval_order() + [None])

        el.set('t-tag', el.tag)
        if not (set(['t-esc', 't-raw', 't-field']) & set(el.attrib)):
            el.set('t-content', 'True')

        return body + self._compile_directives(el, options, indent=indent)

    def _compile_directives(self, el, options, indent):
        """ Compile the given element, following the directives given in the
        iterator ``options['iter_directives']``.

        :return: list of AST nodes
        """

        if el.tag != 't' and not any(att.startswith('t-') and att not in ['t-tag', 't-content'] for att in el.attrib):
            el.attrib.pop('t-tag', None)
            el.attrib.pop('t-content', None)
            return self._compile_static_node(el, options, indent=indent)

        # compile the first directive present on the element
        for directive in options['iter_directives']:
            if ('t-' + directive) in el.attrib:
                mname = directive.replace('-', '_')
                compile_handler = getattr(self, '_compile_directive_%s' % mname, None)

                interpret_handler = 'render_tag_%s' % mname
                if hasattr(self, interpret_handler):
                    _logger.warning(
                        "Directive '%s' must be AST-compiled. Dynamic interpreter %s will ignored",
                        mname, interpret_handler
                    )

                return compile_handler(el, options, indent=indent)

        # all directives have been compiled, there should be none left
        if any(att.startswith('t-') for att in el.attrib):
            raise NameError("Unknown directive on %s" % etree.tostring(el, encoding='unicode'))
        return []

    def _compile_options(self, el):
        """
        compile t-options and add to the dict the t-options-xxx values
        """
        options = el.attrib.pop('t-options', None)

        dict_arg = []
        for key in OrderedDict(el.attrib):
            if key.startswith('t-options-'):
                option_name = key[10:]
                dict_arg.append('"%s":%s' % (self._compile_str(option_name), self._compile_expr(el.attrib.pop(key))))

        if options and dict_arg:
            return "__qweb_merged_dict(dict(%s), {%s})" % (self._compile_expr(options), u', '.join(dict_arg))
        elif options:
            return "dict(%s)" % (self._compile_expr(options))
        elif dict_arg:
            return "{%s}" % (u', '.join(dict_arg))
        return None

    def _compile_format(self, expr):
        """ Parses the provided format string and compiles it to a single
        expression ast, uses string concatenation via "+".
        """
        text = '"'
        base_idx = 0
        for m in _FORMAT_REGEX.finditer(expr):
            literal = expr[base_idx:m.start()]
            if literal:
                text += self._compile_str(literal if isinstance(literal, str) else literal.decode('utf-8'))
            text += '" + __qweb_to_text(%s) + "' % self._compile_expr(m.group(1) or m.group(2))
            base_idx = m.end()
        # string past last regex match
        literal = expr[base_idx:]
        if literal:
            text += self._compile_str(literal if isinstance(literal, str) else literal.decode('utf-8'))
        text += '"'
        return text

    def _compile_expr(self, expr):
        if '__qweb_' in expr:
            raise SyntaxError("All values containing '__qweb_' are reserved. '%s' is forbidden." % expr)
        return "(%s)" % expr

    def _compile_str(self, expr):
        return str(expr).replace('"','\\"').replace("'","\\'")

    def _compile_str_html(self, expr):
        return escape(expr)

    # order

    def _directives_eval_order(self):
        """ List all supported directives in the order in which they should be
        evaluated on a given element. For instance, a node bearing both
        ``foreach`` and ``if`` should see ``foreach`` executed before ``if`` aka
        .. code-block:: xml
            <el t-foreach="foo" t-as="bar" t-if="bar">
        should be equivalent to
        .. code-block:: xml
            <t t-foreach="foo" t-as="bar">
                <t t-if="bar">
                    <el>
        then this method should return ``['foreach', 'if']``.
        """
        return [
            'debug',
            # 'cache',
            'groups', 'foreach', 'if', 'elif', 'else',
            'field', 'esc', 'raw',
            'tag',
            'call',
            'set',
            'content',
        ]

    def _is_static_node(self, el, options):
        """ Test whether the given element is purely static, i.e., does not
        require dynamic rendering for its attributes.
        """
        return not any(att.startswith('t-') for att in el.attrib)

    # compile

    def _compile_start_profiling(self, el, directive, options, indent):
        if 'profile' not in options:
            return []

        ref = options['ref']
        path = options['root'].getpath(el) if el is not None else ''
        loginfo = 'loginfo_%s_%s' % (path, directive)

        return [self._indent(
            """%(loginfo)s = __qweb_self._stop_log_profiling(%(ref)s, "%(doc)s", "%(path)s", "%(directive)s", __qweb_locals(), __qweb_options)""" % {
                'ref': ref if isinstance(ref, int) else '"%s"' % self._compile_str(ref),
                'doc': self._compile_str(str(options.get('document'))),
                'path': self._compile_str(path),
                'directive': self._compile_str(directive or ''),
                'loginfo': loginfo,
            }, indent)]

    def _compile_stop_profiling(self, el, directive, options, indent):
        if 'profile' not in options:
            return []

        ref = options['ref']
        path = options['root'].getpath(el) if el is not None else ''
        loginfo = 'loginfo_%s_%s' % (path, directive)

        return [self._indent(
            """__qweb_self._stop_log_profiling(%(ref)s, "%(doc)s", "%(path)s", "%(directive)s", __qweb_locals(), __qweb_options, %(loginfo)s)""" % {
                'ref': ref if isinstance(ref, int) else '"%s"' % self._compile_str(ref),
                'doc': self._compile_str(str(options.get('document'))),
                'path': self._compile_str(path),
                'directive': self._compile_str(directive or ''),
                'loginfo': loginfo,
            }, indent)]

    def _compile_static_node(self, el, options, indent):
        """ Compile a purely static element into a list of AST nodes. """
        if not el.nsmap:
            unqualified_el_tag = el_tag = el.tag
            attrib = self._post_processing_att(el.tag, el.attrib, options)
        else:
            # Etree will remove the ns prefixes indirection by inlining the corresponding
            # nsmap definition into the tag attribute. Restore the tag and prefix here.
            unqualified_el_tag = etree.QName(el.tag).localname
            el_tag = unqualified_el_tag
            if el.prefix:
                el_tag = '%s:%s' % (el.prefix, el_tag)

            attrib = {}
            # If `el` introduced new namespaces, write them as attribute by using the
            # `attrib` dict.
            for ns_prefix, ns_definition in set(el.nsmap.items()) - set(options['nsmap'].items()):
                if ns_prefix is None:
                    attrib['xmlns'] = ns_definition
                else:
                    attrib['xmlns:%s' % ns_prefix] = ns_definition

            # Etree will also remove the ns prefixes indirection in the attributes. As we only have
            # the namespace definition, we'll use an nsmap where the keys are the definitions and
            # the values the prefixes in order to get back the right prefix and restore it.
            ns = chain(options['nsmap'].items(), el.nsmap.items())
            nsprefixmap = {v: k for k, v in ns}
            for key, value in el.attrib.items():
                attrib_qname = etree.QName(key)
                if attrib_qname.namespace:
                    attrib['%s:%s' % (nsprefixmap[attrib_qname.namespace], attrib_qname.localname)] = value
                else:
                    attrib[key] = value

            attrib = self._post_processing_att(el.tag, attrib, options)

            # Update the dict of inherited namespaces before continuing the recursion. Note:
            # since `options['nsmap']` is a dict (and therefore mutable) and we do **not**
            # want changes done in deeper recursion to bevisible in earlier ones, we'll pass
            # a copy before continuing the recursion and restore the original afterwards.
            original_nsmap = dict(options['nsmap'])

        if unqualified_el_tag != 't':
            self._appendText(u'<%s%s' % (self._compile_str_html(el_tag), u''.join([u' %s=\\"%s\\"' % (self._compile_str_html(name), self._compile_str_html(pycompat.to_text(value))) for name, value in attrib.items()])))
            if unqualified_el_tag in self._void_elements:
                self._appendText(u'/>')
            else:
                self._appendText(u'>')

        if el.nsmap:
            options['nsmap'].update(el.nsmap)
            body = self._compile_directive_content(el, options, indent=indent)
            options['nsmap'] = original_nsmap
        else:
            body = self._compile_directive_content(el, options, indent=indent)

        if unqualified_el_tag != 't':
            if unqualified_el_tag not in self._void_elements:
                self._appendText(u'</%s>' % self._compile_str_html(el_tag))

        return body

    def _compile_attributes(self, indent):
        body = self._flushText(indent)
        body.append(self._indent(dedent("""
            __qweb_attrs = __qweb_self._post_processing_att(__qweb_tagName, __qweb_attrs, __qweb_options)
            for __qweb_name, __qweb_value in __qweb_attrs.items():
                if __qweb_value or isinstance(__qweb_value, str):
                    yield u' '
                    yield __qweb_name
                    yield u'="'
                    yield __qweb_self._compile_str_html(__qweb_to_text(__qweb_value))
                    yield u'"'
        """), indent))
        return body

    def _compile_static_attributes(self, el, options, indent):
        """ Compile the static and dynamc attributes of the given element into
        a list of pairs (name, expression AST).

        We do not support namespaced dynamic attributes.
        """
        # Etree will also remove the ns prefixes indirection in the attributes. As we only have
        # the namespace definition, we'll use an nsmap where the keys are the definitions and
        # the values the prefixes in order to get back the right prefix and restore it.
        nsprefixmap = {v: k for k, v in chain(options['nsmap'].items(), el.nsmap.items())}

        code = []
        for key, value in el.attrib.items():
            if not key.startswith('t-'):
                attrib_qname = etree.QName(key)
                if attrib_qname.namespace:
                    key = '%s:%s' % (nsprefixmap[attrib_qname.namespace], attrib_qname.localname)
                code.append(self._indent('''__qweb_attrs["%(key)s"] = "%(value)s"''' % {
                        'key': self._compile_str(key),
                        'value': self._compile_str(value),
                    }, indent))
        return code

    def _compile_dynamic_attributes(self, el, options, indent):
        """ Compile the dynamic attributes of the given element into a list of
        pairs (name, expression AST).

        We do not support namespaced dynamic attributes.
        """
        code = []
        for name, value in el.attrib.items():
            directive = '%s="%s"' % (name, value)
            code.extend(self._compile_start_profiling(el, directive, options, indent=indent))

            if name.startswith('t-attf-'):
                code.append(self._indent("""__qweb_attrs["%(key)s"] = %(value)s""" % {
                        'key': self._compile_str(name[7:]),
                        'value': self._compile_format(value),
                    }, indent))
            elif name.startswith('t-att-'):
                code.append(self._indent("""__qweb_attrs["%(key)s"] = %(value)s""" % {
                        'key': self._compile_str(name[6:]),
                        'value': self._compile_expr(value),
                    }, indent))
            elif name == 't-att':
                code.append(self._indent("""__qweb_attrs.update(__qweb_self._get_dynamic_att("%(tag)s", %(value)s, __qweb_options, __qweb_locals()))""" % {
                    'tag': self._compile_str(el.tag),
                    'value': self._compile_expr(value),
                }, indent))

            code.extend(self._compile_stop_profiling(el, directive, options, indent=indent))
        return code

    def _compile_all_attributes(self, el, options, indent, attr_already_created=False):
        """ Compile the attributes of the given elements into a list of AST nodes. """
        code = []
        if any(name.startswith('t-att') or not name.startswith('t-') for name, value in el.attrib.items()):
            if not attr_already_created:
                attr_already_created = True
                code.append(self._indent("""__qweb_attrs = __qweb_OrderedDict()""", indent))
            code.extend(self._compile_static_attributes(el, options, indent=indent))
            code.extend(self._compile_dynamic_attributes(el, options, indent=indent))
        if attr_already_created:
            code.append(self._indent('''__qweb_tagName = "%s"''' % self._compile_str(el.tag), indent))
            code.extend(self._compile_attributes(indent))
        return code

    def _compile_tag_open(self, el, options, indent, attr_already_created=False):
        """ Compile the tag of the given element into a list of AST nodes. """
        extra_attrib = {}
        if not el.nsmap:
            unqualified_el_tag = el_tag = el.tag
        else:
            # Etree will remove the ns prefixes indirection by inlining the corresponding
            # nsmap definition into the tag attribute. Restore the tag and prefix here.
            # Note: we do not support namespace dynamic attributes, we need a default URI
            # on the root and use attribute directive t-att="{'xmlns:example': value}".
            unqualified_el_tag = etree.QName(el.tag).localname
            el_tag = unqualified_el_tag
            if el.prefix:
                el_tag = '%s:%s' % (el.prefix, el_tag)

            # If `el` introduced new namespaces, write them as attribute by using the
            # `extra_attrib` dict.
            for ns_prefix, ns_definition in set(el.nsmap.items()) - set(options['nsmap'].items()):
                if ns_prefix is None:
                    extra_attrib['xmlns'] = ns_definition
                else:
                    extra_attrib['xmlns:%s' % ns_prefix] = ns_definition

        code = []
        if unqualified_el_tag != 't':
            self._appendText(u'<%s%s' % (self._compile_str_html(el_tag), u''.join([u' %s=\\"%s\\"' % (name, self._compile_str_html(pycompat.to_text(value))) for name, value in extra_attrib.items()])))
            code.extend(self._compile_all_attributes(el, options, indent, attr_already_created))
            if unqualified_el_tag in self._void_elements:
                self._appendText(u'/>')
            else:
                self._appendText(u'>')

        return code

    def _compile_tag_close(self, el):
        if not el.nsmap:
            unqualified_el_tag = el_tag = el.tag
        else:
            unqualified_el_tag = etree.QName(el.tag).localname
            el_tag = unqualified_el_tag
            if el.prefix:
                el_tag = '%s:%s' % (el.prefix, el_tag)

        if unqualified_el_tag != 't':
            if el_tag not in self._void_elements:
                self._appendText(u'</%s>' % self._compile_str_html(el_tag))
        return []

    # compile directives

    def _compile_directive_debug(self, el, options, indent):
        debugger = el.attrib.pop('t-debug')
        code = []
        if options['dev_mode']:
            code.append(self._indent("__qweb_import('%s').set_trace()" % re.sub(r'[^a-zA-Z]', '', debugger), indent))  # pdb, ipdb, pudb, ...
        else:
            _logger.warning("@t-debug in template is only available in dev mode options")
        code.extend(self._compile_directives(el, options, indent=indent))
        return code

    def _compile_directive_tag(self, el, options, indent):
        el.attrib.pop('t-tag', None)

        code = self._compile_tag_open(el, options, indent, False)

        # Update the dict of inherited namespaces before continuing the recursion. Note:
        # since `options['nsmap']` is a dict (and therefore mutable) and we do **not**
        # want changes done in deeper recursion to bevisible in earlier ones, we'll pass
        # a copy before continuing the recursion and restore the original afterwards.
        if el.nsmap:
            code.extend(self._compile_directives(el, dict(options, nsmap=el.nsmap), indent))
        else:
            code.extend(self._compile_directives(el, options, indent=indent))

        code.extend(self._compile_tag_close(el))

        return code

    def _compile_directive_set(self, el, options, indent):
        varname = el.attrib.pop('t-set')
        directive = 't-set="%s"' % varname
        code = []
        code.extend(self._compile_start_profiling(el, directive, options, indent=indent))

        if not re.match(_VAR_REGEXP, varname):
            raise SyntaxError("t-set varname '%s' should contains only letters, digits or underscore." % varname)

        if 't-value' in el.attrib:
            expr = el.attrib.pop('t-value') or 'None'
            directive = '%s t-value="%s"' % (directive, expr)
            expr = self._compile_expr(expr)
        elif 't-valuef' in el.attrib:
            exprf = el.attrib.pop('t-valuef')
            directive = '%s t-valuef="%s"' % (directive, exprf)
            expr = self._compile_format(exprf)
        else:
            # set the content as value
            def_name = self._make_name("__qweb_t_set_")
            code.extend(self._flushText(indent))
            content = self._compile_directive_content(el, options, indent=indent + 1) + self._flushText(indent + 1)
            if content:
                code.append(self._indent("""def %s():""" % def_name, indent))
                code.extend(content)
                expr = """u''.join(%s())""" % def_name
            else:
                expr = """u''"""

        code.append(self._indent("""%(varname)s = %(expr)s""" % {
                'varname': varname,
                'expr': expr,
            }, indent))
        code.extend(self._compile_stop_profiling(el, directive, options, indent=indent))
        return code

    def _compile_directive_content(self, el, options, indent):
        if el.text is not None:
            self._appendText(self._compile_str_html(el.text))
        body = []
        if el.getchildren():
            for item in el:
                # ignore comments & processing instructions
                if isinstance(item, etree._Comment):
                    continue
                body.extend(self._compile_node(item, options, indent=indent))
                if item.tail is not None:
                    self._appendText(self._compile_str_html(item.tail))
        return body

    def _compile_directive_else(self, el, options, indent):
        if el.attrib.pop('t-else') == '_t_skip_else_':
            return []
        if not options.pop('t_if', None):
            raise ValueError("t-else directive must be preceded by t-if directive")
        compiled = self._compile_directives(el, options, indent=indent)
        el.attrib['t-else'] = '_t_skip_else_'
        return compiled

    def _compile_directive_elif(self, el, options, indent):
        _elif = el.attrib.pop('t-elif')
        if _elif == '_t_skip_else_':
            return []
        if not options.pop('t_if', None):
            raise ValueError("t-elif directive must be preceded by t-if directive")
        el.attrib['t-temp-elif'] = _elif
        compiled = self._compile_directive_if(el, options, indent=indent)
        el.attrib['t-elif'] = '_t_skip_else_'
        return compiled

    def _compile_directive_if(self, el, options, indent):
        code = self._flushText(indent)
        content_if = self._compile_directives(el, options, indent=indent + 1) + self._flushText(indent + 1)

        orelse = []
        next_el = el.getnext()
        comments_to_remove = []
        while isinstance(next_el, etree._Comment):
            comments_to_remove.append(next_el)
            next_el = next_el.getnext()
        if next_el is not None and {'t-else', 't-elif'} & set(next_el.attrib):
            parent = el.getparent()
            for comment in comments_to_remove:
                parent.remove(comment)
            if el.tail and not el.tail.isspace():
                raise ValueError("Unexpected non-whitespace characters between t-if and t-else directives")
            el.tail = None
            orelse = self._compile_node(next_el, dict(options, t_if=True), indent + 1) + self._flushText(indent + 1)

        expr = el.attrib.pop('t-temp-elif', el.attrib.pop('t-if', None))
        directive = ('t-elif="%s"' if 't-temp-elif' in el.attrib else 't-if="%s"') % expr

        code.extend(self._compile_start_profiling(el, directive, options, indent=indent))
        code.append(self._indent("""if %s:""" % self._compile_expr(expr), indent))
        code.extend(self._compile_stop_profiling(el, directive, options, indent=indent + 1))
        code.extend(content_if or self._indent('pass', indent + 1))
        if orelse:
            code.append(self._indent("""else:""", indent))
            code.extend(self._compile_stop_profiling(el, directive, options, indent=indent + 1))
            code.extend(orelse)
        return code

    def _compile_directive_groups(self, el, options, indent):
        groups = el.attrib.pop('t-groups')
        directive = 'groups="%s"' % groups
        code = self._flushText(indent)
        code.extend(self._compile_start_profiling(el, directive, options, indent=indent))
        code.append(self._indent("""if self.user_has_groups("%s"):""" % self._compile_str(groups), indent))
        code.extend(self._compile_stop_profiling(el, directive, options, indent=indent + 1))
        code.extend(self._compile_directives(el, options, indent=indent + 1) or self._indent('pass', indent + 1))
        return code

    def _compile_directive_foreach(self, el, options, indent):
        expr_foreach = el.attrib.pop('t-foreach')
        expr_as = el.attrib.pop('t-as')
        directive = 't-foreach="%s" t-as="%s"' % (expr_foreach, expr_as)
        code = self._flushText(indent)
        content_foreach = self._compile_directives(el, options, indent=indent + 1) + self._flushText(indent + 1)

        if not re.match(_VAR_REGEXP, expr_as):
            raise SyntaxError("t-as varname '%s' should contains only letters, digits or underscore." % expr_as)

        code.extend(self._compile_start_profiling(el, directive, options, indent=indent))
        stop_profiling = self._compile_stop_profiling(el, directive, options, indent=indent + 1)

        code.append(self._indent(dedent("""
                __qweb_enum = %(expr)s or []
                for %(varname)s_index, %(varname)s in enumerate(__qweb_enum):
                    if isinstance(__qweb_enum, dict):
                        %(varname)s_value = __qweb_enum[%(varname)s]
                    else:
                        %(varname)s_value = %(varname)s
            """) % {
                'expr': self._compile_expr(expr_foreach),
                'varname': expr_as,
            }, indent))
        code.extend(stop_profiling)
        code.extend(content_foreach or self._indent('continue', indent + 1))

        if stop_profiling:
            code.append(self._indent("""else:""", indent))
            code.extend(stop_profiling)

        return code

    def _compile_directive_esc(self, el, options, indent, name="esc"):
        field_options = self._compile_options(el)
        expr = el.attrib.pop('t-' + name)
        directive = 't-%s="%s"' % (name, expr)
        code = self._flushText(indent)
        code.extend(self._compile_start_profiling(el, directive, options, indent=indent))

        if expr == "0":
            if field_options or name == "esc":
                code.append(self._indent("""__qweb_content = u''.join(__qweb_0)""", indent))
            else:
                code.append(self._indent("""__qweb_content = __qweb_0""", indent))
        else:
            code.append(self._indent("""__qweb_content = %s""" % self._compile_expr(expr), indent))

        if field_options:
            code.append(self._indent(dedent("""
                    __qweb_attrs, __qweb_content, __qweb_force_display = __qweb_self._get_widget(__qweb_content, "%(expr)s", "%(tag)s", %(field_options)s, __qweb_options, __qweb_locals())
                    __qweb_content = __qweb_to_text(__qweb_content)
                """ % {
                    'expr': self._compile_str(expr),
                    'tag': self._compile_str(el.tag),
                    'field_options': field_options,
                }), indent))
        else:
            if name == "esc":
                code.append(self._indent(dedent("""
                    if __qweb_content is not False and __qweb_content is not None:
                        __qweb_content = __qweb_self._compile_str_html(__qweb_to_text(__qweb_content))
                    """).strip(), indent))
            code.append(self._indent("""__qweb_force_display = None""", indent))

        code.extend(self._compile_widget_value(el, options, indent=indent, without_attributes=not field_options))
        code.extend(self._compile_stop_profiling(el, directive, options, indent=indent))
        return code

    def _compile_directive_raw(self, el, options, indent):
        return self._compile_directive_esc(el, options, indent, 'raw')

    def _compile_directive_field(self, el, options, indent):
        """ Compile something like ``<span t-field="record.phone">+1 555 555 8069</span>`` """
        tagName = el.tag
        assert tagName not in ("table", "tbody", "thead", "tfoot", "tr", "td",
                                 "li", "ul", "ol", "dl", "dt", "dd"),\
            "RTE widgets do not work correctly on %r elements" % tagName
        assert tagName != 't',\
            "t-field can not be used on a t element, provide an actual HTML node"
        assert "." in el.get('t-field'),\
            "t-field must have at least a dot like 'record.field_name'"

        expression = el.attrib.pop('t-field')
        directive = 't-field="%s"' % expression
        field_options = self._compile_options(el) or "dict()"
        record, field_name = expression.rsplit('.', 1)

        if not re.match(_VAR_REGEXP, field_name):
            raise SyntaxError("t-field fieldName part '%s' should contains only letters, digits or underscore." % expression)

        code = self._compile_start_profiling(el, directive, options, indent=indent)
        code.append(self._indent("""__qweb_attrs, __qweb_content, __qweb_force_display = __qweb_self._get_field(%(record)s, "%(field_name)s", "%(expression)s", "%(tagName)s", %(field_options)s, __qweb_options, __qweb_locals())""" % {
            'record': self._compile_expr(record),
            'field_name': self._compile_str(field_name),
            'expression': self._compile_str(expression),
            'tagName': self._compile_str(tagName),
            'field_options': field_options,
        }, indent))
        code.extend(self._compile_widget_value(el, options, indent=indent))
        code.extend(self._compile_stop_profiling(el, directive, options, indent=indent))
        return code

    def _compile_widget_value(self, el, options, indent=0, without_attributes=False):
        el.attrib.pop('t-tag', None)

        code = self._flushText(indent)
        code.append(self._indent("""if __qweb_content is not None and __qweb_content is not False:""", indent))
        code.extend(self._compile_tag_open(el, options, indent + 1, not without_attributes))
        code.extend(self._flushText(indent + 1))
        code.append(self._indent(dedent("""
                if isinstance(__qweb_content, (__qweb_GeneratorType, list)):
                    yield from __qweb_content
                else:
                    yield __qweb_to_text(__qweb_content)
        """).strip(), indent + 1))
        code.extend(self._compile_tag_close(el))
        code.extend(self._flushText(indent + 1))

        default_body = self._compile_directive_content(el, options, indent=indent + 1)
        if default_body or self._text_concat:
            # default content
            _text_concat = list(self._text_concat)
            self._text_concat.clear()
            code.append(self._indent("""else:""", indent))
            code.extend(self._compile_tag_open(el, options, indent + 1, not without_attributes))
            code.extend(default_body)
            self._text_concat.extend(_text_concat)
            code.extend(self._compile_tag_close(el))
            code.extend(self._flushText(indent + 1))
        else:
            content = self._compile_tag_open(el, options, indent + 1, not without_attributes) + \
                self._compile_tag_close(el) + \
                self._flushText(indent + 1)
            if content:
                code.append(self._indent("""elif __qweb_force_display:""", indent))
                code.extend(content)

        return code

    def _compile_directive_call(self, el, options, indent):
        expr = el.attrib.pop('t-call')
        directive = 't-call="%s"' % expr
        _values = self._make_name('values_copy')

        if el.attrib.get('t-call-options'): # retro-compatibility
            el.attrib.set('t-options', el.attrib.pop('t-call-options'))
        call_options = self._compile_options(el)

        nsmap = options.get('nsmap')

        code = self._flushText(indent)
        code.extend(self._compile_start_profiling(el, directive, options, indent=indent))

        # content (t-raw="0" and variables)
        code.append(self._indent("""__qweb_t_call_values = __qweb_locals()""", indent))
        code.append(self._indent("""def __qweb_t_call_0():""", indent))
        content = self._compile_directive_content(el, options, indent=indent + 1) + self._flushText(indent + 1)
        if content:
            code.extend(content)
        else:
            code.append(self._indent("""yield ''""", indent + 1))
        code.append(self._indent("""__qweb_t_call_values.update(__qweb_locals())""", indent + 1))
        code.append(self._indent("""__qweb_t_call_values.pop(0, None)""", indent + 1))
        code.append(self._indent("""__qweb_t_call_values.pop('__qweb_in_cache__', None)""", indent + 1))
        code.append(self._indent("""__qweb_t_call_values.update(__qweb_0=list(__qweb_t_call_0()))""", indent))

        # options
        code.append(self._indent(dedent("""
            __qweb_t_call_options = __qweb_options.copy()
            __qweb_t_call_options.update({
                'caller_template': "%(template)s",
                'last_path_node': "%(last)s",
            })
            """ % {
                'template': self._compile_str(str(options.get('template'))),
                'last': self._compile_str(str(options['root'].getpath(el)))
            }).strip(), indent))
        if nsmap:
            # update this dict with the current nsmap so that the callee know
            # if he outputting the xmlns attributes is relevenat or not
            nsmap = []
            for key, value in options['nsmap'].items():
                nsmap.append('%s:"%s"' % ('"%s"' % self._compile_str(key) if isinstance(key, str) else None, self._compile_str(value)))
            code.append(self._indent("""__qweb_t_call_options.update(nsmap={%s})""" % (', '.join(nsmap)), indent))

        # call
        if call_options:
            code.append(self._indent("""__qweb_t_call_options.update(%s)""" % call_options, indent))
            code.append(self._indent(dedent("""
                if __qweb_options.get('lang') != __qweb_t_call_options.get('lang'):
                    __qweb_self_lang = __qweb_self.with_context(lang=__qweb_t_call_options.get('lang'))
                    yield from __qweb_self_lang.compile(%(template)s, __qweb_t_call_options)(__qweb_self_lang, __qweb_t_call_values)
                else:
                    yield from __qweb_self.compile(%(template)s, __qweb_t_call_options)(__qweb_self, __qweb_t_call_values)
                """ % {
                    'template': self._compile_format(expr)
                }).strip(), indent))
        else:
            code.append(self._indent(dedent("""
                yield from __qweb_self.compile(%(template)s, __qweb_t_call_options)(__qweb_self, __qweb_t_call_values)
                """ % {'template': self._compile_format(expr)}).strip(), indent))

        code.extend(self._compile_stop_profiling(el, directive, options, indent=indent))

        return code

    # def _compile_directive_cache(self, el, options, indent):
    #     expr = el.attrib.pop('t-cache')
    #     directive = 't-cache="%s"' % expr

    #     def_name = self._make_name("__qweb_t_cache")

    #     code = self._flushText(indent)
    #     code.extend(self._compile_start_profiling(el, directive, options, indent=indent))
    #     code.append(self._indent(dedent("""
    #         def %(def_name)s():
    #             __qweb_t_cache_values = __qweb_locals()
    #             __qweb_t_cache_values.update(__qweb_in_cache__=True)
    #             def %(def_name)s_sub():
    #                 __qweb_locals.update({'TODO': True})

    #         """ % {'def_name': def_name}), indent))
    #     code.extend(self._compile_directives(el, options, indent=indent + 2) + self._flushText(indent + 2))
    #     code.append(self._indent(dedent("""
    #             cache_id = (%(expr)s)
    #             if cache_id is not None and cache_id is not False:
    #                 content = self._cache_content(options, cache_id, lambda: list(%(def_name)s_sub))
    #             else:
    #                 content = %(def_name)s_sub()

    #             for item in content:
    #                 if hasattr(item, '__call__'):
    #                     yield from item()
    #                 else:
    #                     yield item

    #         if '__qweb_in_cache__' in values:
    #             yield lambda: %(def_name)s()
    #         else:
    #             yield from %(def_name)s()

    #         """ % {'expr': expr, 'def_name': def_name}), indent))

    #     code.extend(self._compile_stop_profiling(el, directive, options, indent=indent))

    #     return code

    # method called by computing code

    def _get_dynamic_att(self, tagName, atts, options, values):
        if isinstance(atts, OrderedDict):
            return atts
        if isinstance(atts, (list, tuple)) and not isinstance(atts[0], (list, tuple)):
            atts = [atts]
        if isinstance(atts, (list, tuple)):
            atts = OrderedDict(atts)
        return atts

    def _post_processing_att(self, tagName, atts, options):
        """ Method called by the compiled code. This method may be overwrited
            to filter or modify the attributes after they are compiled.

            @returns OrderedDict
        """
        return atts

    def _get_field(self, record, field_name, expression, tagName, field_options, options, values):
        """
        :returns: tuple:
            * OrderedDict: attributes
            * string or None: content
            * boolean: force_display display the tag if the content and default_content are None
        """
        return self._get_widget(getattr(record, field_name, None), expression, tagName, field_options, options, values)

    def _get_widget(self, value, expression, tagName, field_options, options, values):
        """
        :returns: tuple:
            * OrderedDict: attributes
            * string or None: content
            * boolean: force_display display the tag if the content and default_content are None
        """
        return (OrderedDict(), value, False)

    def _start_log_profiling(self, ref, arch, xpath, directive, values, options, indent):
        return time()

    def _stop_log_profiling(self, ref, arch, xpath, directive, values, options, loginfo):
        dt = (time() - loginfo) * 1000
        _logger.debug({
            'ref': ref,
            'xpath': xpath,
            'directive': directive,
            'time': loginfo,
            'delay': dt,
        })

    # def _cache_content(self, options, cache_id, get_value):
    #     if 'cache' not in options:
    #         raise ValueError("The dict 'cache' is not present in the compilation options.")
    #     if cache_id not in options['cache']:
    #         options['cache'][cache_id] = get_value()
    #     return options['cache'][cache_id]

    # compile expression
