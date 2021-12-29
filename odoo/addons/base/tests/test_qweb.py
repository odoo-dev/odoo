# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import collections
import json
import os.path
import re
import markupsafe
import itertools

from lxml import etree, html
from lxml.builder import E
from copy import deepcopy
from textwrap import dedent

from odoo.modules import get_module_resource
from odoo.tests.common import TransactionCase
from odoo.addons.base.models.ir_qweb import QWebException, render
from odoo.tools import misc, mute_logger
from odoo.tools.json import scriptsafe as json_scriptsafe

unsafe_eval = eval


class TestQWebTField(TransactionCase):
    def setUp(self):
        super(TestQWebTField, self).setUp()
        self.env_branding = self.env(context={'inherit_branding': True})
        self.engine = self.env_branding['ir.qweb']

    def test_trivial(self):
        field = etree.Element('span', {'t-field': 'company.name'})
        company = self.env['res.company'].create({'name': "My Test Company"})

        result = self.engine._render(field, {'company': company})
        self.assertEqual(
            etree.fromstring(result),
            etree.fromstring('<span data-oe-model="res.company" data-oe-id="%d" '
                  'data-oe-field="name" data-oe-type="char" '
                  'data-oe-expression="company.name">%s</span>' % (
                company.id,
                "My Test Company",
            )),
        )

    def test_i18n(self):
        field = etree.Element('span', {'t-field': 'company.name'})
        s = "Testing «ταБЬℓσ»: 1<2 & 4+1>3, now 20% off!"
        company = self.env['res.company'].create({'name': s})

        result = self.engine._render(field, {'company': company})
        self.assertEqual(
            etree.fromstring(result),
            etree.fromstring('<span data-oe-model="res.company" data-oe-id="%d" '
                  'data-oe-field="name" data-oe-type="char" '
                  'data-oe-expression="company.name">%s</span>' % (
                company.id,
                misc.html_escape(s),
            )),
        )

    def test_reject_crummy_tags(self):
        field = etree.Element('td', {'t-field': 'company.name'})

        with self.assertRaisesRegex(QWebException, r'QWeb widgets do not work correctly'):
            self.engine._render(field, {'company': None})

    def test_reject_t_tag(self):
        field = etree.Element('t', {'t-field': 'company.name'})

        with self.assertRaisesRegex(QWebException, r't-field can not be used on a t element'):
            self.engine._render(field, {'company': None})

    def test_render_t_options(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy"><root><span t-esc="5" t-options="{'widget': 'char'}" t-options-widget="'float'" t-options-precision="4"/></root></t>
            """
        })
        text = etree.fromstring(view1._render()).find('span').text
        self.assertEqual(text, '5.0000')

    def test_xss_breakout(self):
        view = self.env['ir.ui.view'].create({
            'name': 'dummy', 'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <root>
                        <script type="application/javascript">
                            var s = <t t-esc="json.dumps({'key': malicious})"/>;
                        </script>
                    </root>
                </t>
            """
        })
        rendered = view._render({'malicious': '1</script><script>alert("pwned")</script><script>'})
        self.assertIn('alert', rendered, "%r doesn't seem to be rendered" % rendered)
        doc = etree.fromstring(rendered)
        self.assertEqual(len(doc.xpath('//script')), 1)

class TestQWebNS(TransactionCase):
    def test_render_static_xml_with_namespace(self):
        """ Test the rendering on a namespaced view with no static content. The resulting string should be untouched.
        """
        expected_result = """
            <root>
                <h:table xmlns:h="http://www.example.org/table">
                    <h:tr>
                        <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
                <f:table xmlns:f="http://www.example.org/furniture">
                    <f:width>80</f:width>
                </f:table>
            </root>
        """

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">%s</t>
            """ % expected_result
        })

        self.assertEqual(etree.fromstring(view1._render()), etree.fromstring(expected_result))

    def test_render_static_xml_with_namespace_2(self):
        """ Test the rendering on a namespaced view with no static content. The resulting string should be untouched.
        """
        expected_result = """
            <html xmlns="http://www.w3.org/HTML/1998/html4" xmlns:xdc="http://www.xml.com/books">
                <head>
                    <title>Book Review</title>
                </head>
                <body>
                    <xdc:bookreview>
                        <xdc:title>XML: A Primer</xdc:title>
                        <table>
                            <tr align="center">
                                <td>Author</td><td>Price</td>
                                <td>Pages</td><td>Date</td>
                            </tr>
                            <tr align="left">
                                <td><xdc:author>Simon St. Laurent</xdc:author></td>
                                <td><xdc:price>31.98</xdc:price></td>
                                <td><xdc:pages>352</xdc:pages></td>
                                <td><xdc:date>1998/01</xdc:date></td>
                            </tr>
                        </table>
                    </xdc:bookreview>
                </body>
            </html>
        """

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">%s</t>
            """ % expected_result
        })

        self.assertEqual(etree.fromstring(view1._render()), etree.fromstring(expected_result))

    def test_render_static_xml_with_useless_distributed_namespace(self):
        """ Test that redundant namespaces are stripped upon rendering.
        """
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <root>
                        <h:table xmlns:h="http://www.example.org/table">
                            <h:tr xmlns:h="http://www.example.org/table">
                                <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                                <h:td xmlns:h="http://www.example.org/table">Bananas</h:td>
                            </h:tr>
                        </h:table>
                    </root>
                </t>
            """
        })

        expected_result = etree.fromstring("""
            <root>
                <h:table xmlns:h="http://www.example.org/table">
                    <h:tr>
                        <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
            </root>
        """)

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_static_xml_with_namespace_3(self):
        expected_result = """
            <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv32.xsd"></cfdi:Comprobante>
        """

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">%s</t>
            """ % expected_result
        })

        self.assertEqual(etree.fromstring(view1._render()), etree.fromstring(expected_result))

    def test_render_static_xml_with_namespace_dynamic(self):
        """ Test the rendering on a namespaced view with dynamic URI (need default namespace uri).
        """
        tempate = """
            <root xmlns:h="https://default.namespace.url/h">
                <h:table t-att="{'xmlns:h': h1}">
                    <h:tr>
                        <h:td t-att="{'xmlns:h': h2}">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
            </root>
        """
        expected_result = """
            <root xmlns:h="https://default.namespace.url/h">
                <h:table xmlns:h="%(h1)s">
                    <h:tr>
                        <h:td xmlns:h="%(h2)s">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
            </root>
        """

        values = dict(h1="http://www.example.org/table", h2="http://www.w3.org/TD/html4/")

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">%s</t>
            """ % tempate
        })

        rendering = view1._render(values, engine='ir.qweb')

        self.assertEqual(etree.fromstring(rendering), etree.fromstring(expected_result % values))

    def test_render_static_xml_with_namespace_dynamic_2(self):
        """ Test the rendering on a namespaced view with dynamic URI (need default namespace uri).
        Default URIs must be differents.
        """
        tempate = """
            <root xmlns:f="https://default.namespace.url/f" xmlns:h="https://default.namespace.url/h" >
                <h:table t-att="{'xmlns:h': h1}">
                    <h:tr>
                        <h:td t-att="{'xmlns:h': h2}">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
                <f:table t-att="{'xmlns:f': f}">
                    <f:width>80</f:width>
                </f:table>
            </root>
        """
        expected_result = """
            <root xmlns:f="https://default.namespace.url/f" xmlns:h="https://default.namespace.url/h">
                <h:table xmlns:h="%(h1)s">
                    <h:tr>
                        <h:td xmlns:h="%(h2)s">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
                <f:table xmlns:f="%(f)s">
                    <f:width>80</f:width>
                </f:table>
            </root>
        """

        values = dict(h1="http://www.example.org/table", h2="http://www.w3.org/TD/html4/", f="http://www.example.org/furniture")

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">%s</t>
            """ % tempate
        })

        rendering = view1._render(values, engine='ir.qweb')

        self.assertEqual(etree.fromstring(rendering), etree.fromstring(expected_result % values))

    def test_render_dynamic_xml_with_namespace_t_esc(self):
        """ Test that rendering a template containing a node having both an ns declaration and a t-esc attribute correctly
        handles the t-esc attribute and keep the ns declaration.
        """
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" t-esc="'test'"/>
                </t>
            """
        })

        expected_result = etree.fromstring("""<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">test</Invoice>""")

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_dynamic_xml_with_namespace_t_esc_with_useless_distributed_namespace(self):
        """ Test that rendering a template containing a node having both an ns declaration and a t-esc attribute correctly
        handles the t-esc attribute and keep the ns declaration, and distribute correctly the ns declaration to its children.
        """
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" t-attf-test="test">
                        <cac:Test xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">blabla</cac:Test>
                    </Invoice>
                </t>
            """
        })

        expected_result = etree.fromstring("""
            <Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" test="test">
                <cac:Test>blabla</cac:Test>
            </Invoice>
        """)

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_dynamic_xml_with_namespace_t_attf(self):
        """ Test that rendering a template containing a node having both an ns declaration and a t-attf attribute correctly
        handles the t-attf attribute and keep the ns declaration.
        """
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <root>
                        <h:table xmlns:h="http://www.example.org/table">
                            <h:tr>
                                <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                                <h:td>Bananas</h:td>
                            </h:tr>
                        </h:table>
                        <f:table xmlns:f="http://www.example.org/furniture">
                            <f:width t-attf-test="1">80</f:width>
                        </f:table>
                    </root>
                </t>
            """
        })

        expected_result = etree.fromstring("""
            <root>
                <h:table xmlns:h="http://www.example.org/table">
                    <h:tr>
                        <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                        <h:td>Bananas</h:td>
                    </h:tr>
                </h:table>
                <f:table xmlns:f="http://www.example.org/furniture">
                    <f:width test="1">80</f:width>
                </f:table>
            </root>
        """)

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_dynamic_xml_with_namespace_t_attf_with_useless_distributed_namespace(self):
        """ Test that rendering a template containing a node having both an ns declaration and a t-attf attribute correctly
        handles the t-attf attribute and that redundant namespaces are stripped upon rendering.
        """
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                <root>
                    <h:table xmlns:h="http://www.example.org/table">
                        <h:tr>
                            <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                            <h:td>Bananas</h:td>
                        </h:tr>
                    </h:table>
                    <f:table xmlns:f="http://www.example.org/furniture">
                        <f:width xmlns:f="http://www.example.org/furniture" t-attf-test="1">80</f:width>
                    </f:table>
                </root>

                </t>
            """
        })

        expected_result = etree.fromstring("""
                <root>
                    <h:table xmlns:h="http://www.example.org/table">
                        <h:tr>
                            <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                            <h:td>Bananas</h:td>
                        </h:tr>
                    </h:table>
                    <f:table xmlns:f="http://www.example.org/furniture">
                        <f:width test="1">80</f:width>
                    </f:table>
                </root>

        """)

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_dynamic_xml_with_namespace_2(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
                        <cbc:UBLVersionID t-esc="version_id"/>
                        <t t-foreach="[1, 2, 3, 4]" t-as="value">
                            Oasis <cac:Test t-esc="value"/>
                        </t>
                    </Invoice>
                </t>
            """
        })

        expected_result = etree.fromstring("""
            <Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
                <cbc:UBLVersionID>1.0</cbc:UBLVersionID>

                    Oasis <cac:Test>1</cac:Test>

                    Oasis <cac:Test>2</cac:Test>

                    Oasis <cac:Test>3</cac:Test>

                    Oasis <cac:Test>4</cac:Test>

            </Invoice>
        """)

        self.assertEqual(etree.fromstring(view1._render({'version_id': 1.0})), expected_result)

    def test_render_static_xml_with_namespaced_attributes(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv32.xsd">abc</cfdi:Comprobante>
                </t>
            """
        })

        expected_result = etree.fromstring("""<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv32.xsd">abc</cfdi:Comprobante>""")

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_dynamic_xml_with_namespaced_attributes(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv32.xsd" t-esc="'abc'"/>
                </t>
            """
        })

        expected_result = etree.fromstring("""<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/3 http://www.sat.gob.mx/sitio_internet/cfd/3/cfdv32.xsd">abc</cfdi:Comprobante>""")

        self.assertEqual(etree.fromstring(view1._render()), expected_result)

    def test_render_static_xml_with_t_call(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <cac:fruit xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
                        <cac:table>
                            <cbc:td>Appel</cbc:td>
                            <cbc:td>Pineappel</cbc:td>
                        </cac:table>
                    </cac:fruit>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view1.id])

        # view2 will t-call view1
        view2 = self.env['ir.ui.view'].create({
            'name': "dummy2",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy2">
                    <root xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
                        <cac:line t-foreach="[1, 2]" t-as="i" t-call="base.dummy"/>
                    </root>
                </t>
            """
        })

        result = view2._render()
        result_etree = etree.fromstring(result)

        # check that the root tag has all its xmlns
        expected_ns = {
            (None, 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'),
            ('cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'),
            ('cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'),
        }
        self.assertEqual(set(result_etree.nsmap.items()), expected_ns)

        # check that the t-call did its work
        cac_lines = result_etree.findall('.//cac:line', namespaces={'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'})
        self.assertEqual(len(cac_lines), 2)
        self.assertEqual(result.count('Appel'), 2)

        # check that the t-call dit not output again the xmlns declaration
        self.assertEqual(result.count('xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'), 1)

    def test_render_static_xml_with_extension(self):
        """ Test the extension of a view by an xpath expression on a ns prefixed element.
        """
        # primary view
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <root>
                        <h:table xmlns:h="http://www.example.org/table">
                            <h:tr>
                                <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                                <h:td>Bananas</h:td>
                            </h:tr>
                        </h:table>
                    </root>
                </t>
            """
        })
        # extension patching the primary view
        view2 = self.env['ir.ui.view'].create({
            'name': "dummy_ext",
            'type': 'qweb',
            'inherit_id': view1.id,
            'arch': """
                <xpath expr="//{http://www.example.org/table}table/{http://www.example.org/table}tr">
                        <h:td xmlns:h="http://www.example.org/table">Oranges</h:td>
                </xpath>
            """
        })

        expected_result = etree.fromstring("""
            <root>
                <h:table xmlns:h="http://www.example.org/table">
                    <h:tr>
                        <h:td xmlns:h="http://www.w3.org/TD/html4/">Apples</h:td>
                        <h:td>Bananas</h:td>
                        <h:td>Oranges</h:td>
                    </h:tr>
                </h:table>
            </root>
        """)

        self.assertEqual(
            etree.fromstring(view1.with_context(check_view_ids=[view1.id, view2.id])._render()),
            expected_result
        )

    def test_render_dynamic_xml_with_code_error(self):
        """ Test that, when rendering a template containing a namespaced node
            that evaluates code with errors, the proper exception is raised
        """
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <Invoice xmlns:od="http://odoo.com/od">
                        <od:name t-att-test="'a' + 1"/>
                    </Invoice>
                </t>
            """
        })

        try:
            "" + 0
        except TypeError as e:
            error_msg = e.args[0]

        with self.assertRaises(QWebException, msg=error_msg):
            view1._render()

class TestQWebBasic(TransactionCase):
    def test_compile_expr(self):
        tests = [
            #pylint: disable=C0326
            # source,                                   values,                         result
            ("1 +2+ 3",                                 {},                             6),
            ("(((1 +2+ 3)))",                           {},                             6),
            ("(1) +(2+ (3))",                           {},                             6),
            ("a == 5",                                  {'a': 5},                       True),
            ("{'a': True}",                             {},                             {'a': True}),
            ("object.count(1)",                         {'object': [1, 2, 1 ,1]},       3),
            ("dict(a=True)",                            {},                             {'a': True}),
            ("fn(a=11, b=22) or a",                     {'a': 1, 'fn': lambda a,b: 0},  1),
            ("fn(a=11, b=22) or a",                     {'a': 1, 'fn': lambda a,b: b},  22),
            ("(lambda a: a)(5)",                        {},                             5),
            ("(lambda a: a[0])([5])",                   {},                             5),
            ("(lambda test: len(test))('aaa')",         {},                             3),
            ("{'a': lambda a: a[0], 'b': 3}['a']([5])", {},                             5),
            ("list(map(lambda a: a[0], r))",            {'r': [(1,11), (2,22)]},        [1, 2]),
            ("z + (head or 'z')",                       {'z': 'a'},                     "az"),
            ("z + (head or 'z')",                       {'z': 'a', 'head': 'b'},        "ab"),
            ("{a:b for a, b in [(1,11), (2, 22)]}",     {},                             {1: 11, 2: 22}),
            ("any({x == 2 for x in [1,2,3]})",          {},                             True),
            ("any({x == 5 for x in [1,2,3]})",          {},                             False),
            ("{x:y for x,y in [('a', 11),('b', 22)]}",  {},                             {'a': 11, 'b': 22}),
            ("[(y,x) for x,y in [(1, 11),(2, 22)]]",    {},                             [(11, 1), (22, 2)]),
            ("(lambda a: a + 5)(x)",                    {'x': 10},                      15),
            ("(lambda a: a + x)(5)",                    {'x': 10},                      15),
            ("sum(x for x in range(4)) + ((x))",        {'x': 10},                      16),
            ("['test_' + x for x in ['a', 'b']]",       {},                             ['test_a', 'test_b']),
            ("""1 and 2 and 0
                or 9""",                                {},                             9),
        ]

        IrQweb = self.env['ir.qweb']
        for expr, q_values, result in tests:
            expr_namespace = IrQweb._compile_expr(expr)

            compiled = compile("""def test(values):\n  values['result'] = %s""" % expr_namespace, '<test>', 'exec')
            globals_dict = IrQweb._prepare_globals()
            values = {}
            unsafe_eval(compiled, globals_dict, values)
            test = values['test']

            test(q_values)
            q_result = dict(q_values, result=result)
            self.assertDictEqual(q_values, q_result, "Should compile: %s" % expr)

    def test_foreach_as_error_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="iter-list">
                <t t-foreach="[3, 2, 1]">
                    [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]</t>
            </t>'''
        })

        with self.assertRaises(QWebException):
            t._render()

        try:
            t._render()
        except QWebException as e:
            error = str(e)
            self.assertIn("KeyError: 't-as'", error)
            self.assertIn('<t t-foreach="[3, 2, 1]"/>', error)

    def test_foreach_as_error_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="iter-list">
                <t t-foreach="[3, 2, 1]" t-as="">
                    [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]</t>
            </t>'''
        })

        with self.assertRaises(QWebException):
            t._render()

        try:
            t._render()
        except QWebException as e:
            error = str(e)
            self.assertIn("KeyError: 't-as'", error)
            self.assertIn('<t t-foreach="[3, 2, 1]" t-as=""/>', error)

    def test_foreach_as_error_3(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="iter-list">
                <t t-foreach="[3, 2, 1]" t-as="b-2">
                    [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]</t>
            </t>'''
        })

        with self.assertRaises(QWebException):
            t._render()

        try:
            t._render()
        except QWebException as e:
            error = str(e)
            self.assertIn("The varname 'b-2' can only contain alphanumeric characters and underscores", error)
            self.assertIn('<t t-foreach="[3, 2, 1]" t-as="b-2"/>', error)

    def test_compile_expr_security(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-escaping">
                <div>
                    <t t-set="o" t-value="(lambda a=open: a)()"/>
                    <t t-out="o('/etc/passwd').read()"/>
                </div>
            </t>'''
        })
        values = {'other': 'any value'}
        with self.assertRaises(Exception): # NotImplementedError for 'lambda a=open' and Undefined value 'open'.
            self.env['ir.qweb']._render(t.id, values)

    def test_foreach_iter_list(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="iter-list">
                <t t-foreach="[3, 2, 1]" t-as="item">
                    [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]</t>
            </t>'''
        })
        result = """
                    [0: 3 3]
                    [1: 2 2]
                    [2: 1 1]
        """

        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_foreach_iter_dict(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="iter-dict">
                <t t-foreach="{'a': 3, 'b': 2, 'c': 1}" t-as="item">
                    [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]</t>
            </t>'''
        })
        result = """
                    [0: a 3]
                    [1: b 2]
                    [2: c 1]
        """

        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_att_escaping_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-escaping">
                <div t-att-bibi="json.dumps(bibi)">1</div>
                <div t-att-toto="toto">2</div>
            </t>'''
        })
        result = """
                <div bibi="{&#34;a&#34;: &#34;string&#34;, &#34;b&#34;: 1}">1</div>
                <div toto="a&#39;b&#34;c">2</div>
            """
        values = {'json': json_scriptsafe, 'bibi': dict(a='string', b=1), 'toto': "a'b\"c"}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_att_escaping_2(self):

        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-escaping">
                <t t-set="abc"> <t t-if="add_abc"><t t-out="add_abc"/> <span a="b"> | </span></t><t t-out="efg"/> </t>
                <div t-att-abc="abc">123</div>
            </t>'''
        })
        result = """
                <div abc=" &amp;#34;yes&amp;#34; &lt;span a=&#34;b&#34;&gt; | &lt;/span&gt;-efg- ">123</div>
            """
        values = {'add_abc': '"yes"', 'efg': '-efg-'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_attf_escaping_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-escaping">
                <div t-attf-bibi="a, b &gt; c &gt; #{d}">1</div>
            </t>'''
        })
        result = """
                <div bibi="a, b &gt; c &gt; a&#39; &gt; b&#34;c">1</div>
            """
        values = {'d': "a' > b\"c"}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_attf_escaping_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-escaping">
                <a t-attf-href="/link/#{ url }/#{other and 'sub'}">link</a>
                <a t-attf-href="/link/#{ url }/#{(not other) and 'sub'}">link2</a>
            </t>'''
        })
        result = """
                <a href="/link/odoo/sub">link</a>
                <a href="/link/odoo/">link2</a>
            """
        values = {'url': 'odoo', 'other': True}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_attf_escaping_3(self):

        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-escaping">
                <div t-attf-abc="abc #{val} { other }">123</div>
            </t>'''
        })
        result = """
                <div abc="abc &#34;yes&#34; { other }">123</div>
            """
        values = {'val': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="a" t-value="'abc %s' % 1"/>
                <div t-out="a"/>
            </t>'''
        })
        result = """
                <div>abc 1</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="a" t-valuef="abc {{1}}"/>
                <div t-out="a"/>
            </t>'''
        })
        result = """
                <div>abc 1</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_3(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set-a="'abc %s' % 1"/>
                <div t-out="a"/>
            </t>'''
        })
        result = """
                <div>abc 1</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_4(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-setf-a="abc {{1}}"/>
                <div t-out="a"/>
            </t>'''
        })
        result = """
                <div>abc 1</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_5(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set='{"a": "abc %s" % 1,
                    "b": 2}'/>
                <div t-out="a"/>
            </t>'''
        })
        result = """
                <div>abc 1</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_body_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="abc"> <span a="b"> [%s] </span> </t>
                <div t-att-abc="abc % add_abc">123</div>
            </t>'''
        })
        result = """
                <div abc=" &lt;span a=&#34;b&#34;&gt; [&amp;#34;yes&amp;#34;] &lt;/span&gt; ">123</div>
            """
        values = {'add_abc': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_body_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="abc"> <span a="b"> toto </span> </t>
                <div t-att-abc="'[%s]' % abc">123</div>
                <div class="a1" t-out="abc"/>
                <div class="a2" t-out="'[%s]' % abc"/>
            </t>'''
        })
        result = """
                <div abc="[ &lt;span a=&#34;b&#34;&gt; toto &lt;/span&gt; ]">123</div>
                <div class="a1"> <span a="b"> toto </span> </div>
                <div class="a2">[ &lt;span a=&#34;b&#34;&gt; toto &lt;/span&gt; ]</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_set_error_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="" t-value="1"/>
            </t>'''
        })

        with self.assertRaises(QWebException):
            t._render()

        try:
            t._render()
        except QWebException as e:
            error = str(e)
            self.assertIn("KeyError: 't-set'", error)
            self.assertIn('<t t-set="" t-value="1"/>', error)

    def test_set_error_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="b-2" t-value="1"/>
            </t>'''
        })

        with self.assertRaises(QWebException):
            t._render()

        try:
            t._render()
        except QWebException as e:
            error = str(e)
            self.assertIn("The varname can only contain alphanumeric characters and underscores", error)
            self.assertIn('<t t-set="b-2" t-value="1"/>', error)

    def test_out(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="out-format"><div t-out="a">Default</div></t>'''
        })
        result = """<div>1</div>"""
        rendered = self.env['ir.qweb']._render(t.id, {'a': 1})
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_format_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="out-format">
                <t t-set="final_message">Powered by %s%s</t>
                <div t-out="final_message % (a, b and ('-%s' % b) or '')"/>
            </t>'''
        })
        result = """
                <div>Powered by 1-2</div>
        """
        rendered = self.env['ir.qweb']._render(t.id, {'a': 1, 'b': 2})
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_format_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="set">
                <t t-set="toto">Toto %s</t>
                <t t-set="abc"> <span a="b"> [%s , %s] </span> </t>
                <div t-out="(abc % (add_abc, toto)) % 5">123</div>
            </t>'''
        })
        result = """
                <div> <span a="b"> [&#34;yes&#34; , Toto 5] </span> </div>
            """
        values = {'add_abc': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_format_3(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-set">
                <t t-set="toto">Toto %s</t>
                <t t-set="abc"> <span a="b"> a </span> </t>
                <div t-out="(toto + abc) % v">123</div>
            </t>'''
        })
        result = """
                <div>Toto &#34;yes&#34; <span a="b"> a </span> </div>
            """
        values = {'v': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_format_4(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-set">
                <t t-set="abc"> <span a="b"> a </span> </t>
                <div t-out="(v + abc)">123</div>
            </t>'''
        })
        result = """
                <div>&#34;yes&#34; <span a="b"> a </span> </div>
            """
        values = {'v': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_format_5(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-set">
                <t t-set="abc"> <span a="b"> a </span> </t>
                <div t-out="(abc + v)">123</div>
            </t>'''
        })
        result = """
                <div> <span a="b"> a </span> &#34;yes&#34;</div>
            """
        values = {'v': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_format_6(self):
        # Use str method will use the string value. t-out will escape this str
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-set">
                <t t-set="abc"> <span a="b"> a </span> </t>
                <div t-out="(abc.strip() + v)">123</div>
            </t>'''
        })
        result = """
                <div><span a="b"> a </span>&#34;yes&#34;</div>
            """
        values = {'v': '"yes"'}
        rendered = self.env['ir.qweb']._render(t.id, values)
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_escape_text(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy"><root><span t-out="text" t-options-widget="'text'"/></root></t>
            """
        })
        html = view1._render({'text': """a
        b <b>c</b>"""})
        self.assertEqual(html, """<root><span data-oe-type="text" data-oe-expression="text">a<br>
        b &lt;b&gt;c&lt;/b&gt;</span></root>""")

    def test_out_markup(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="esc-markup">
                <t t-set="content"><span>toto</span></t>
                <div t-out="content"/>
            </t>'''
        })
        result = """
                <div><span>toto</span></div>
        """
        rendered = self.env['ir.qweb']._render(t.id, {})
        self.assertEqual(rendered.strip(), result.strip())

    def test_out_default_value(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="out-default">
                <span rows="10" t-out="a">
                    DEFAULT
                    <t t-out="'Text'" />
                </span>
            </t>'''
        })
        result = """
                <span rows="10">Hello</span>
        """
        rendered = self.env['ir.qweb']._render(t.id, {'a': 'Hello'})
        self.assertEqual(str(rendered.strip()), result.strip())

        result = """
                <span rows="10">
                    DEFAULT
                    Text
                </span>
        """
        rendered = self.env['ir.qweb']._render(t.id, {})
        self.assertEqual(str(rendered.strip()), result.strip())

    def test_esc_markup(self):
        # t-esc is equal to t-out
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="esc-markup">
                <t t-set="content"><span>toto</span></t>
                <div t-esc="content"/>
            </t>'''
        })
        ref = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="esc-markup">
                <t t-set="content"><span>toto</span></t>
                <div t-out="content"/>
            </t>'''
        })
        rendered = self.env['ir.qweb']._render(t.id, {})
        result = self.env['ir.qweb']._render(ref.id, {})
        self.assertEqual(rendered.strip(), result.strip())

    def test_if_from_body(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="attr-set">
                <t t-set="abc"> <span a="b"> a </span> </t>
                <div t-if="abc">123</div>
                <div t-if="not abc">456</div>
            </t>'''
        })
        result = """
                <div>123</div>
            """
        rendered = self.env['ir.qweb']._render(t.id)
        self.assertEqual(rendered.strip(), result.strip())

    def test_error_message_1(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="test">
                <section>
                    <div t-esc="abc + def">
                        <span>content</span>
                    </div>
                </section>
            </t>'''
        })
        with self.assertRaises(QWebException):
            self.env['ir.qweb']._render(t.id)

        try:
            self.env['ir.qweb']._render(t.id)
        except QWebException as e:
            error = str(e)
            self.assertIn('<div t-esc="abc + def"/>', error)

    def test_error_message_2(self):
        t = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name="test">
                <section>
                    <div t-esc="abc + def + (">
                        <span>content</span>
                    </div>
                </section>
            </t>'''
        })
        with self.assertRaises(QWebException):
            self.env['ir.qweb']._render(t.id)

        try:
            self.env['ir.qweb']._render(t.id)
        except QWebException as e:
            error = str(e)
            self.assertIn('Can not compile expression', error)
            self.assertIn('<div t-esc="abc + def + ("/>', error)

    def test_call_set(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <table>
                        <tr><td t-out="a"/></tr>
                        <t t-set="a">3</t>
                    </table>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "other",
            'type': 'qweb',
            'arch': """
                <t t-name="base.other">
                    <div>
                        <t t-set="a">1</t>
                        <t t-set="b">1</t>
                        <t t-call="base.dummy">
                            <t t-set="b">2</t>
                        </t>
                        <span t-out="a"/>
                        <span t-out="b"/>
                    </div>
                </t>
            """
        })

        result = view1._render({})
        self.assertEqual(etree.fromstring(result), etree.fromstring("""
            <div>
                <table>
                    <tr><td>1</td></tr>
                </table>
                <span>1</span>
                <span>1</span>
            </div>
        """), 'render t-call use lexical scoping, t-call content use independant scoping')

    def test_call_arg(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <table>
                        <tr><td t-out="a"/></tr>
                        <tr><td t-out="b"/></tr>
                    </table>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "other",
            'type': 'qweb',
            'arch': """
                <t t-name="base.other">
                    <div>
                        <t t-call="base.dummy" t-set-a="1" t-set-b="2"/>
                    </div>
                </t>
            """
        })

        result = view1._render({})
        self.assertEqual(etree.fromstring(result), etree.fromstring("""
            <div>
                <table>
                    <tr><td>1</td></tr>
                    <tr><td>2</td></tr>
                </table>
            </div>
        """), 'render t-call with t-set attributes')

    def test_call_arg_error(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <table>
                        <tr><td t-out="a-2"/></tr>
                        <tr><td t-out="b-2"/></tr>
                    </table>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "other",
            'type': 'qweb',
            'arch': """
                <t t-name="base.other">
                    <div>
                        <t t-call="base.dummy" t-set-a-2="1" t-set-b-2="2"/>
                    </div>
                </t>
            """
        })

        with self.assertRaises(QWebException):
            view1._render()

        try:
            view1._render()
        except QWebException as e:
            error = str(e)
            self.assertIn("The varname 'a-2' can only contain alphanumeric characters and underscores", error)
            self.assertIn('<t t-call="base.dummy" t-set-a-2="1" t-set-b-2="2"/>', error)

    def test_call_error(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "other",
            'type': 'qweb',
            'arch': """
                <t t-name="base.other">
                    <div>
                        <t t-call="base.dummy"/>
                    </div>
                </t>
            """
        })

        with self.assertRaises(QWebException):
            view1._render()

        try:
            view1._render()
        except QWebException as e:
            error = str(e)
            self.assertIn('External ID not found in the system: base.dummy', error)
            self.assertIn('<t t-call="base.dummy"/>', error)

    def test_render_t_call_propagates_t_lang(self):
        current_lang = 'en_US'
        other_lang = 'fr_FR'

        lang = self.env['res.lang']._activate_lang(other_lang)
        lang.write({
            'decimal_point': '*',
            'thousands_sep': '/'
        })

        view1 = self.env['ir.ui.view'].create({
            'name': "callee",
            'type': 'qweb',
            'arch': """
                <t t-name="base.callee">
                    <t t-esc="9000000.00" t-options="{'widget': 'float', 'precision': 2}" />
                </t>
            """
        })
        self.env['ir.model.data'].create({
            'name': 'callee',
            'model': 'ir.ui.view',
            'module': 'base',
            'res_id': view1.id,
        })

        view2 = self.env['ir.ui.view'].create({
            'name': "calling",
            'type': 'qweb',
            'arch': """
                <t t-name="base.calling">
                    <t t-call="base.callee" t-lang="'%s'" />
                </t>
            """ % other_lang
        })

        rendered = view2.with_context(lang=current_lang)._render().strip()
        self.assertEqual(rendered, '9/000/000*00')

    def test_render_barcode(self):
        partner = self.env['res.partner'].create({
            'name': 'bacode_test',
            'barcode': 'test'
        })

        view = self.env['ir.ui.view'].create({
            'name': "a_barcode_view",
            'type': 'qweb',
        })

        view.arch = """<div t-field="partner.barcode" t-options="{'widget': 'barcode', 'width': 100, 'height': 30}"/>"""
        rendered = view._render(values={'partner': partner}).strip()
        self.assertRegex(rendered, r'<div><img alt="Barcode test" src="data:image/png;base64,\S+"></div>')

        partner.barcode = '4012345678901'
        view.arch = """<div t-field="partner.barcode" t-options="{'widget': 'barcode', 'symbology': 'EAN13', 'width': 100, 'height': 30, 'img_style': 'width:100%;', 'img_alt': 'Barcode'}"/>"""
        ean_rendered = view._render(values={'partner': partner}).strip()
        self.assertRegex(ean_rendered, r'<div><img style="width:100%;" alt="Barcode" src="data:image/png;base64,\S+"></div>')

        view.arch = """<div t-field="partner.barcode" t-options="{'widget': 'barcode', 'symbology': 'auto', 'width': 100, 'height': 30, 'img_style': 'width:100%;', 'img_alt': 'Barcode'}"/>"""
        auto_rendered = view._render(values={'partner': partner}).strip()
        self.assertRegex(auto_rendered, r'<div><img style="width:100%;" alt="Barcode" src="data:image/png;base64,\S+"></div>')

    def test_render_comment_tail(self):
        """ Test the rendering of a tail text, near a comment.
        """

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': "qweb",
            'arch': """
            <t>
                <!-- it is a comment -->
                <!-- it is another comment -->
                Text 1
                <!-- it is still another comment -->
                Text 2
                <t>ok</t>
            </t>
            """
        })
        emptyline = '\n                '
        expected = markupsafe.Markup('Text 1' + emptyline + emptyline + 'Text 2' + emptyline + 'ok')
        self.assertEqual(view1._render().strip(), expected)

    def test_void_element(self):
        view = self.env['ir.ui.view'].create({
            'name': 'master',
            'type': 'qweb',
            'arch_db': '''<t t-name='master'>
                <meta name="1"/>
                <t t-set="data" t-value="1"/>
                <meta groups="base.group_no_one" name="2"/>
                <meta t-if="False" name="3"/>
                <meta t-if="True" name="4"/>
                <span t-out="1"/>
            </t>'''
        })

        result = '''
                <meta name="1"/>
                <meta name="4"/>
                <span>1</span>
            '''
        rendered = self.env['ir.qweb']._render(view.id)

        self.assertEqual(str(rendered).strip(), result.strip())

    def test_space_remove_technical_space(self):
        test = self.env['ir.ui.view'].create({
            'name': 'test',
            'type': 'qweb',
            'arch_db': '''<t t-name='test'>
                <span t-out="value"/>
            </t>'''
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('test', 'ir.ui.view', %s, 'base')", [test.id])

        view = self.env['ir.ui.view'].create({
            'name': 'master',
            'type': 'qweb',
            'arch_db': '''<t t-name='master'>

                    <section>
                        <meta name="1"/>
                        <t t-set="data" t-value="1"/>
                        <meta groups="base.group_no_one" name="2"/>
                        <meta t-if="False" name="3"/>
                        <meta t-if="True" name="4"/>

                        <article>
                            <t t-foreach="[0, 1]" t-as="value">
                                <t t-call="base.test"/>
                            </t>

                            <t t-if="False">
                                a
                            </t>
                    
                            b

                            <t t-if="True">
                                c <t t-out="1"/>  
                                d
                            </t>
                        </article>


                        <article>
                            <div t-foreach="[0, 1]" t-as="value">
                                <t t-call="base.test"/>
                            </div>

                            <i t-if="False">
                                a
                            </i>
                            <u t-if="False">
                                a
                            </u>
                    
                            b

                            <i t-if="True">
                                c <t t-out="1"/>  
                                d
                            </i>
                        </article>
                    </section>
                </t>'''
        })

        result = '''
                    <section>
                        <meta name="1"/>
                        <meta name="4"/>

                        <article>
                <span>0</span>
                <span>1</span>

                    
                            b

                                c 1  
                                d
                        </article>


                        <article>
                            <div>
                <span>0</span>
                            </div>
                            <div>
                <span>1</span>
                            </div>

                    
                            b

                            <i>
                                c 1  
                                d
                            </i>
                        </article>
                    </section>'''

        rendered = self.env['ir.qweb']._render(view.id)

        self.assertEqual(str(rendered), result)

class TestQwebCache(TransactionCase):
    def test_01_render_xml_cache_base(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div t-cache="cache_id" class="toto">
                        <table>
                            <tr><td><span t-esc="value[0]"/></td></tr>
                            <tr><td><span t-esc="value[1]"/></td></tr>
                            <tr><td><span t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        expected_result = etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
            </div>
        """)

        view1 = view1.with_context(use_qweb_cache=True)

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [1, 2, 3]}))
        self.assertEqual(result, expected_result, 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [10, 20, 30]}))
        self.assertEqual(result, expected_result, 'Next rendering use cache')

    def test_02_render_xml_cache_different(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><span t-esc="value[0]"/></td></tr>
                            <tr><td><span t-esc="value[1]"/></td></tr>
                            <tr><td><span t-esc="value[2]"/></td></tr>
                        </table>
                        <table t-cache="cache_id2">
                            <tr><td><span t-esc="value2[0]"/></td></tr>
                            <tr><td><span t-esc="value2[1]"/></td></tr>
                            <tr><td><span t-esc="value2[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': 1,
            'cache_id2': 1,
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache with different cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (2, 5, 6),
            'cache_id2': (2, 5, 5),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>41</span></td></tr>
                    <tr><td><span>42</span></td></tr>
                    <tr><td><span>43</span></td></tr>
                </table>
                <table>
                    <tr><td><span>51</span></td></tr>
                    <tr><td><span>52</span></td></tr>
                    <tr><td><span>53</span></td></tr>
                </table>
            </div>
        """), 'Use different cache id')

    def test_03_render_xml_cache_contains_false(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div t-cache="cache_id" class="toto">
                        <table>
                            <tr><td><span t-esc="value[0]"/></td></tr>
                            <tr t-cache="None"><td><span t-esc="value[1]"/></td></tr>
                            <tr><td><span t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=True)

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [1, 2, 3]}))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
            </div>
        """), 'First rendering add compiled values in cache')

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [10, 20, 30]}))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>20</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
            </div>
        """), 'Next rendering use cache exept for t-cache="None"')

    def test_04_render_xml_cache_recursive(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <tr>
                                <td>
                                    <table t-cache="cache_id2">
                                        <tr><td><t t-esc="value2[0]"/></td></tr>
                                        <tr><td><t t-esc="value2[1]"/></td></tr>
                                        <tr><td><t t-esc="value2[2]"/></td></tr>
                                    </table>
                                </td>
                            </tr>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_05_render_xml_cache_false_recursive(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <tr t-cache="None">
                                <td>
                                    <table t-cache="cache_id2">
                                        <tr><td><t t-esc="value2[0]"/></td></tr>
                                        <tr><td><t t-esc="value2[1]"/></td></tr>
                                        <tr><td><t t-esc="value2[2]"/></td></tr>
                                    </table>
                                </td>
                            </tr>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_06_render_xml_no_cache_base(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div t-cache="cache_id" class="toto">
                        <table>
                            <tr><td><span t-esc="value[0]"/></td></tr>
                            <tr><td><span t-esc="value[1]"/></td></tr>
                            <tr><td><span t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [1, 2, 3]}))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [10, 20, 30]}))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>10</span></td></tr>
                    <tr><td><span>20</span></td></tr>
                    <tr><td><span>30</span></td></tr>
                </table>
            </div>
        """), 'Next rendering use cache')

    def test_07_render_xml_no_cache_different(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><span t-esc="value[0]"/></td></tr>
                            <tr><td><span t-esc="value[1]"/></td></tr>
                            <tr><td><span t-esc="value[2]"/></td></tr>
                        </table>
                        <table t-cache="cache_id2">
                            <tr><td><span t-esc="value2[0]"/></td></tr>
                            <tr><td><span t-esc="value2[1]"/></td></tr>
                            <tr><td><span t-esc="value2[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': 1,
            'cache_id2': 1,
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
                <table>
                    <tr><td><span>10</span></td></tr>
                    <tr><td><span>20</span></td></tr>
                    <tr><td><span>30</span></td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache with different cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (2, 5, 6),
            'cache_id2': (2, 5, 5),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>41</span></td></tr>
                    <tr><td><span>42</span></td></tr>
                    <tr><td><span>43</span></td></tr>
                </table>
                <table>
                    <tr><td><span>51</span></td></tr>
                    <tr><td><span>52</span></td></tr>
                    <tr><td><span>53</span></td></tr>
                </table>
            </div>
        """), 'Use different cache id')

    def test_08_render_xml_no_cache_contains_false(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div t-cache="cache_id" class="toto">
                        <table>
                            <tr><td><span t-esc="value[0]"/></td></tr>
                            <tr t-cache="None"><td><span t-esc="value[1]"/></td></tr>
                            <tr><td><span t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [1, 2, 3]}))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>1</span></td></tr>
                    <tr><td><span>2</span></td></tr>
                    <tr><td><span>3</span></td></tr>
                </table>
            </div>
        """), 'First rendering add compiled values in cache')

        result = etree.fromstring(view1._render({'cache_id': 1, 'value': [10, 20, 30]}))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td><span>10</span></td></tr>
                    <tr><td><span>20</span></td></tr>
                    <tr><td><span>30</span></td></tr>
                </table>
            </div>
        """), 'Next rendering use cache exept for t-cache="None"')

    def test_09_render_xml_no_cache_recursive(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <tr>
                                <td>
                                    <table t-cache="cache_id2">
                                        <tr><td><t t-esc="value2[0]"/></td></tr>
                                        <tr><td><t t-esc="value2[1]"/></td></tr>
                                        <tr><td><t t-esc="value2[2]"/></td></tr>
                                    </table>
                                </td>
                            </tr>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>41</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>43</td></tr>
                </table>
            </div>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_10_render_xml_no_cache_false_recursive(self):
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <tr t-cache="None">
                                <td>
                                    <table t-cache="cache_id2">
                                        <tr><td><t t-esc="value2[0]"/></td></tr>
                                        <tr><td><t t-esc="value2[1]"/></td></tr>
                                        <tr><td><t t-esc="value2[2]"/></td></tr>
                                    </table>
                                </td>
                            </tr>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>41</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>43</td></tr>
                </table>
            </div>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_11_render_xml_cache_with_t_set(self):
        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <section t-cache="cache_id">
                        <t t-set="counter" t-value="counter + 100"/>
                        <article t-cache="None"><t t-out="counter"/></article>
                        <div>cache: <t t-out="counter"/></div>
                    </section>
                </t>
            """
        })

        render = template_page._render({
            'cache_id': 1,
            'counter': 1,
        })
        result = """
            <section>
                <article>101</article>
                <div>cache: 101</div>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1 (1 != 101: cached t-set should is applied on first rendering)')

        render = template_page._render({
            'cache_id': 1,
            'counter': 2,
        })
        result = """
            <section>
                <article>2</article>
                <div>cache: 101</div>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2 (102 != 2: cached t-set should not applied)')

        render = template_page._render({
            'cache_id': 3,
            'counter': 3,
        })
        result = """
            <section>
                <article>103</article>
                <div>cache: 103</div>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3 (3 != 103: cached t-set should applied because the new cache key is created)')

    def test_12_render_xml_cache_with_t_set_out_of_cache(self):
        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <root>
                        <t t-set="counter" t-value="counter + 100"/>
                        <section t-cache="cache_id">
                            <article t-cache="None"><t t-out="counter"/></article>
                            <div>cache: <t t-out="counter"/></div>
                        </section>
                    </root>
                </t>
            """
        })

        render = template_page._render({
            'cache_id': 1,
            'counter': 1,
        })
        result = """
            <root>
                <section>
                    <article>101</article>
                    <div>cache: 101</div>
                </section>
            </root>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1 (1 != 101: cached t-set should is applied on first rendering)')

        render = template_page._render({
            'cache_id': 1,
            'counter': 2,
        })
        result = """
            <root>
                <section>
                    <article>102</article>
                    <div>cache: 101</div>
                </section>
            </root>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2 (2 != 102: cached t-set should be applied the template part are rendered every time)')

        render = template_page._render({
            'cache_id': 3,
            'counter': 3,
        })
        result = """
            <root>
                <section>
                    <article>103</article>
                    <div>cache: 103</div>
                </section>
            </root>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3 (3 != 103: cached t-set should applied because the new cache key is created)')

    def test_13_render_xml_cache_with_t_set_complexe(self):
        template = self.env['ir.ui.view'].create({
            'name': "base.template",
            'type': 'qweb',
            'arch': """
                <t name="base.template">
                    <t t-cache="None">
                        <span>base.template (cache None): <t t-esc="value_0"/>, <t t-esc="value_1"/>, <t t-esc="value_2"/></span>
                        <t t-set="value_2" t-value="20" t-cache="key"/>
                        <t t-set="value_1" t-value="20"/>
                    </t>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template', 'ir.ui.view', %s, 'base')", [template.id])

        page = self.env['ir.ui.view'].create({
            'name': "base.page",
            'type': 'qweb',
            'arch': """
                <t t-name="base.page">
                    <div t-cache="key">
                        <t t-set="value_0" t-value="10"/>
                        <t t-set="value_1" t-value="10"/>
                        <t t-set="value_2" t-value="10" t-cache="None"/>

                        <t t-call="base.template"/>

                        <t t-cache="None">
                            <span>base.page (cache None): <t t-esc="value_0"/>, <t t-esc="value_1"/>, <t t-esc="value_2"/></span>
                            <t t-set="value_1" t-value="15"/>
                        </t>
                        <span>base.page (cache key): <t t-esc="value_0"/>, <t t-esc="value_1"/>, <t t-esc="value_2"/></span>
                    </div>
                </t>
            """
        })

        page._render({'key': 1, 'value_0': 5, 'value_1': 5, 'value_2': 5})
        render = page._render({'key': 1, 'value_0': 5, 'value_1': 5, 'value_2': 5})
        result = """
            <div>
                <span>base.template (cache None): 5, 5, 10</span>
                <span>base.page (cache None): 5, 5, 10</span>
                <span>base.page (cache key): 10, 15, 10</span>
            </div>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering with cache')

        render = page._render({'key': 2, 'value_0': 5, 'value_1': 5, 'value_2': 5})
        result = """
            <div>
                <span>base.template (cache None): 10, 10, 10</span>
                <span>base.page (cache None): 10, 10, 10</span>
                <span>base.page (cache key): 10, 15, 10</span>
            </div>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering with new cache key')

    def test_14_render_xml_cache_propagation_in_tcall(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "section",
            'type': 'qweb',
            'arch': """
                <t t-name="base.section">
                    <section>
                        <t t-set="counter" t-value="counter + 100"/>
                        <article t-cache="None"><t t-out="counter"/><t t-out="check()"/></article>
                    </section>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('section', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "root",
            'type': 'qweb',
            'arch': """
                <t t-name="base.root">
                    <root t-cache="cache_id">
                        <t t-call="base.section"/>
                    </root>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        check_memory_leak = itertools.count()
        render = view1._render({
            'cache_id': 1,
            'counter': 1,
            'check': lambda: next(check_memory_leak) and '' or '',
        })
        result = """
            <root>
                <section>
                    <article>101</article>
                </section>
            </root>
        """
        self.assertEqual(str(check_memory_leak), 'count(1)', 'rendering 1: value should be called only once')
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), '1 != 101: cached t-set should be applied')

        render = view1._render({
            'cache_id': 1,
            'counter': 2,
            'check': lambda: '',
        })
        result = """
            <root>
                <section>
                    <article>2</article>
                </section>
            </root>
        """
        self.assertEqual(str(check_memory_leak), 'count(1)', 'rendering 2: value should be called only once')
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), '102 != 2: cached t-set should not applied')

        render = view1._render({
            'cache_id': 3,
            'counter': 3,
            'check': lambda: '',
        })
        result = """
            <root>
                <section>
                    <article>103</article>
                </section>
            </root>
        """
        self.assertEqual(str(check_memory_leak), 'count(1)', 'rendering 3: value should be called only once')
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), '3 != 103: cached t-set should be applied')

    def test_15_render_xml_cache_no_cache_tcall_in_tcall_slave_cache(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <tr>
                        <td>
                            <table t-cache="cache_id2">
                                <tr><td><t t-esc="value2[0]"/></td></tr>
                                <tr><td><t t-esc="value2[1]"/></td></tr>
                                <tr><td><t t-esc="value2[2]"/></td></tr>
                            </table>
                        </td>
                    </tr>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="toto">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-call="base.dummy" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="toto">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_16_render_xml_cache_0_in_tcall_slave_cache_no_cache_out0(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-out="0" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view0 = view0.with_context(use_qweb_cache=False)
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <t t-call="base.dummy">
                        <tr t-cache="cache_id2">
                            <td>
                                <table>
                                    <tr><td><t t-esc="value2[0]"/></td></tr>
                                    <tr><td><t t-esc="value2[1]"/></td></tr>
                                    <tr><td><t t-esc="value2[2]"/></td></tr>
                                </table>
                            </td>
                        </tr>
                    </t>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <div class="dummy">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))

        self.assertEqual(result, etree.fromstring("""
            <div class="dummy">
                <table>
                    <tr><td>41</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>43</td></tr>
                </table>
            </div>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))

        self.assertEqual(result, etree.fromstring("""
            <div class="dummy">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_17_render_xml_cache_value_cache_no_cache_tcall_in_tcall_slave_cache_no_cache_outvalue(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-out="row" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view0 = view0.with_context(use_qweb_cache=False)
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <t t-set="row">
                        <tr t-cache="str(cache_id2) + '_2'">
                            <td>
                                <table>
                                    <tr><td><t t-esc="value2[0]"/></td></tr>
                                    <tr><td><t t-esc="value2[1]"/></td></tr>
                                    <tr><td><t t-esc="value2[2]"/></td></tr>
                                </table>
                            </td>
                        </tr>
                    </t>
                    <section t-cache="cache_id2">
                        <t t-call="base.dummy" t-cache="None"/>
                    </section>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>10</td></tr>
                                    <tr><td>20</td></tr>
                                    <tr><td>30</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>41</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>51</td></tr>
                                    <tr><td>52</td></tr>
                                    <tr><td>53</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>43</td></tr>
                    </table>
                </div>
            </section>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>31</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>51</td></tr>
                                    <tr><td>52</td></tr>
                                    <tr><td>53</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>33</td></tr>
                    </table>
                </div>
            </section>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_18_render_xml_cache_tcall_in_tcall_slave_cache_no_cache_out0(self):
        # raw = "0" is equivalent to a cache = "False" because the template can
        # be called by anyone and the content of 0 does not belong to dummy.
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-out="0" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        view0 = view0.with_context(use_qweb_cache=False)
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        # TR is in the main cache but is used by dumy's cache when raw = "0".
        # This means that the value dict must have this one and therefore we
        # cannot send the one by default.
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <section t-cache="cache_id2">
                        <t t-call="base.dummy">
                            <tr>
                                <td>
                                    <table>
                                        <tr><td><t t-esc="value2[0]"/></td></tr>
                                        <tr><td><t t-esc="value2[1]"/></td></tr>
                                        <tr><td><t t-esc="value2[2]"/></td></tr>
                                    </table>
                                </td>
                            </tr>
                        </t>
                    </section>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=False)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>10</td></tr>
                                    <tr><td>20</td></tr>
                                    <tr><td>30</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>41</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>51</td></tr>
                                    <tr><td>52</td></tr>
                                    <tr><td>53</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>43</td></tr>
                    </table>
                </div>
            </section>
        """), 'Second rendering (change inside cache id)')

    def test_19_render_xml_cache_0_in_tcall_slave_cache_no_cache_out0(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "layout",
            'type': 'qweb',
            'arch': """
                <t t-name="base.layout">
                    <div class="layout">
                        <table t-cache="layout_cache_id">
                            <tr><td><t t-out="layout_value[0]"/></td></tr>
                            <t t-out="0" t-cache="None"/>
                            <tr><td><t t-out="layout_value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('layout', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <t t-call="base.layout">
                        <tr t-cache="dummy_cache_id">
                            <td>
                                <table>
                                    <tr><td><t t-out="dummy_value[0]"/></td></tr>
                                    <tr><td><t t-out="dummy_value[1]"/></td></tr>
                                    <tr><td><t t-out="dummy_value[2]"/></td></tr>
                                </table>
                            </td>
                        </tr>
                    </t>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = view1._render({
            'layout_cache_id': (1, 0),
            'dummy_cache_id': (2, 0),
            'layout_value': [1, 2, 3],
            'dummy_value': [10, 20, 30],
        })
        self.assertEqual(etree.fromstring(result), etree.fromstring("""
            <div class="layout">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), '1) rendering (add in cache)')

        # same cache keys
        result = view1._render({
            'layout_cache_id': (1, 0),
            'dummy_cache_id': (2, 0),
        })
        self.assertEqual(etree.fromstring(result), etree.fromstring("""
            <div class="layout">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), '2) use same cache keys')

        # update dummy information
        result = view1._render({
            'layout_cache_id': (1, 0),
            'dummy_cache_id': (2, 1),
            'layout_value': [41, 42, 43],
            'dummy_value': [51, 52, 53],
        })
        self.assertEqual(etree.fromstring(result), etree.fromstring("""
            <div class="layout">
                <table>
                    <tr><td>1</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>51</td></tr>
                                <tr><td>52</td></tr>
                                <tr><td>53</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>3</td></tr>
                </table>
            </div>
        """), '3) rendering (change inside cache id)')

        # update layout information
        result = view1._render({
            'layout_cache_id': (1, 1),
            'dummy_cache_id': (2, 0),
            'layout_value': [31, 32, 33],
            'dummy_value': [51, 52, 53],
        })

        self.assertEqual(etree.fromstring(result), etree.fromstring("""
            <div class="layout">
                <table>
                    <tr><td>31</td></tr>
                    <tr>
                        <td>
                            <table>
                                <tr><td>10</td></tr>
                                <tr><td>20</td></tr>
                                <tr><td>30</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr><td>33</td></tr>
                </table>
            </div>
        """), '4) rendering (change main cache id, old cache inside)')

    def test_20_render_xml_cache_value_cache_no_cache_tcall_in_tcall_slave_cache_no_cache_outvalue(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-out="row" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <t t-set="row">
                        <tr t-cache="str(cache_id2) + '_2'">
                            <td>
                                <table>
                                    <tr><td><t t-esc="value2[0]"/></td></tr>
                                    <tr><td><t t-esc="value2[1]"/></td></tr>
                                    <tr><td><t t-esc="value2[2]"/></td></tr>
                                </table>
                            </td>
                        </tr>
                    </t>
                    <section t-cache="cache_id2">
                        <t t-call="base.dummy" t-cache="None"/>
                    </section>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>10</td></tr>
                                    <tr><td>20</td></tr>
                                    <tr><td>30</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>51</td></tr>
                                    <tr><td>52</td></tr>
                                    <tr><td>53</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'Second rendering (change inside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>31</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>10</td></tr>
                                    <tr><td>20</td></tr>
                                    <tr><td>30</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>33</td></tr>
                    </table>
                </div>
            </section>
        """), 'Third rendering (change main cache id, old cache inside)')

    def test_21_render_xml_cache_tcall_in_tcall_slave_cache_no_cache_out0(self):
        # raw = "0" is equivalent to a cache = "False" because the template can
        # be called by anyone and the content of 0 does not belong to dummy.
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-out="0" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        # TR is in the main cache but is used by dumy's cache when raw = "0".
        # This means that the value dict must have this one and therefore we
        # cannot send the one by default.
        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <section t-cache="cache_id2">
                        <t t-call="base.dummy">
                            <tr>
                                <td>
                                    <table>
                                        <tr><td><t t-esc="value2[0]"/></td></tr>
                                        <tr><td><t t-esc="value2[1]"/></td></tr>
                                        <tr><td><t t-esc="value2[2]"/></td></tr>
                                    </table>
                                </td>
                            </tr>
                        </t>
                    </section>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': [10, 20, 30]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>10</td></tr>
                                    <tr><td>20</td></tr>
                                    <tr><td>30</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [41, 42, 43],
            'value2': [51, 52, 53]
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr>
                            <td>
                                <table>
                                    <tr><td>51</td></tr>
                                    <tr><td>52</td></tr>
                                    <tr><td>53</td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'Second rendering (change inside cache id)')

    def test_22_render_xml_cache_0_in_tcall_slave_cache_no_cache_out0(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <t t-out="0" t-cache="None"/>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <section>
                        <t t-call="base.dummy">
                            <tr t-cache="cache_id2"><td><t t-esc="value2"/></td></tr>
                        </t>
                    </section>
                </t>
            """
        })
        view1 = view1.with_context(use_qweb_cache=True)

        view2 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy2">
                    <section>
                        <t t-call="base.dummy">
                            <tr class="temp2" t-cache="cache_id2"><td><t t-esc="value2"/></td></tr>
                        </t>
                    </section>
                </t>
            """
        })
        view2 = view2.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [1, 2, 3],
            'value2': 10
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr><td>10</td></tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'First rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [21, 22, 23],
            'value2': 20
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr><td>10</td></tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'Second rendering from cache')

        result = etree.fromstring(view2._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [31, 32, 33],
            'value2': 30
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr class="temp2"><td>30</td></tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'First rendering with template 2')

        result = etree.fromstring(view2._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [41, 42, 43],
            'value2': 40
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>1</td></tr>
                        <tr class="temp2"><td>30</td></tr>
                        <tr><td>3</td></tr>
                    </table>
                </div>
            </section>
        """), 'Second rendering from cache for template 2')

    def test_23_render_xml_cache_in_tcall_slave_cache_no_cache_out_template_value(self):
        view0 = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div class="dummy">
                        <table t-cache="cache_id">
                            <tr><td><t t-esc="value[0]"/></td></tr>
                            <tr t-cache="None"><td><t t-esc="value[1]"/></td></tr>
                            <tr><td><t t-esc="value[2]"/></td></tr>
                        </table>
                    </div>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [view0.id])

        view1 = self.env['ir.ui.view'].create({
            'name': "dummy1",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy1">
                    <section t-cache="cache_id2">
                        <t t-call="base.dummy">not used content</t>
                    </section>
                </t>
            """
        })

        view1 = view1.with_context(use_qweb_cache=True)

        # use same cache id, display the same content
        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [11, 12, 13],
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>11</td></tr>
                        <tr><td>12</td></tr>
                        <tr><td>13</td></tr>
                    </table>
                </div>
            </section>
        """), '1) rendering (add in cache)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 0),
            'value': [21, 22, 23],
        }))
        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>11</td></tr>
                        <tr><td>22</td></tr>
                        <tr><td>13</td></tr>
                    </table>
                </div>
            </section>
        """), '2) rendering (same cache, update cache false value)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 0),
            'cache_id2': (2, 1),
            'value': [31, 32, 33],
        }))

        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>11</td></tr>
                        <tr><td>32</td></tr>
                        <tr><td>13</td></tr>
                    </table>
                </div>
            </section>
        """), '3) rendering (change outside cache id)')

        result = etree.fromstring(view1._render({
            'cache_id': (1, 1),
            'cache_id2': (2, 0),
            'value': [41, 42, 43],
        }))

        self.assertEqual(result, etree.fromstring("""
            <section>
                <div class="dummy">
                    <table>
                        <tr><td>41</td></tr>
                        <tr><td>42</td></tr>
                        <tr><td>43</td></tr>
                    </table>
                </div>
            </section>
        """), '4) rendering (change inside cache)')

    def test_24_render_xml_cache_0_in_0_tcall_slave_cache_no_cache_out0_in_first_tcall_slave_cache_no_cache_out0(self):
        template_layout = self.env['ir.ui.view'].create({
            'name': "template_layout",
            'type': 'qweb',
            'arch': """
                <t t-name="template_layout">
                    <html t-cache="True">
                        <body>
                            <t t-out="0" t-cache="None"/>
                        </body>
                    </html>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_layout', 'ir.ui.view', %s, 'base')", [template_layout.id])

        template_header = self.env['ir.ui.view'].create({
            'name': "template_header",
            'type': 'qweb',
            'arch': """
                <t t-name="template_header">
                    <header t-cache="header_cache_id">
                        <div t-cache="None">
                            <t t-out="0"/>
                            <span t-esc="header_value"/>
                        </div>
                        <span t-esc="cached_header_value"/>
                    </header>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_header', 'ir.ui.view', %s, 'base')", [template_header.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <t t-call="base.template_layout">
                        <page t-cache="page_cache_id">
                            <t t-call="base.template_header">
                                <span t-esc="inside_value"/>
                            </t>
                            <span t-esc="cached_value"/>
                        </page>
                    </t>
                </t>
            """
        })

        render = template_page._render({
            'page_cache_id': 1,
            'header_cache_id': 1,
            'inside_value': 11,
            'cached_value': 12,
            'header_value': 101,
            'cached_header_value': 102,
        })
        result = """
            <html>
                <body>
                    <page>
                        <header>
                            <div>
                                <span>11</span>
                                <span>101</span>
                            </div>
                            <span>102</span>
                        </header>
                        <span>12</span>
                    </page>
                </body>
            </html>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1')

        render = template_page._render({
            'page_cache_id': 1,
            'header_cache_id': 1,
            'inside_value': 21,
            'cached_value': 22,
            'header_value': 201,
            'cached_header_value': 202,
        })
        result = """
            <html>
                <body>
                    <page>
                        <header>
                            <div>
                                <span>11</span>
                                <span>201</span>
                            </div>
                            <span>102</span>
                        </header>
                        <span>12</span>
                    </page>
                </body>
            </html>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2')

        render = template_page._render({
            'page_cache_id': 2,
            'header_cache_id': 1,
            'inside_value': 31,
            'cached_value': 32,
            'header_value': 301,
            'cached_header_value': 302,
        })
        result = """
            <html>
                <body>
                    <page>
                        <header>
                            <div>
                                <span>31</span>
                                <span>301</span>
                            </div>
                            <span>102</span>
                        </header>
                        <span>32</span>
                    </page>
                </body>
            </html>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3')

        render = template_page._render({
            'page_cache_id': 1,
            'header_cache_id': 2,
            'inside_value': 41,
            'cached_value': 42,
            'header_value': 401,
            'cached_header_value': 402,
        })
        result = """
            <html>
                <body>
                    <page>
                        <header>
                            <div>
                                <span>11</span>
                                <span>401</span>
                            </div>
                            <span>402</span>
                        </header>
                        <span>12</span>
                    </page>
                </body>
            </html>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 4')

    def test_25_render_xml_cache_tcall_slave_tcall_no_cache_value(self):
        """The counter value are wrapped into a cache and used inside a t-call"""

        template_menu = self.env['ir.ui.view'].create({
            'name': "template_menu",
            'type': 'qweb',
            'arch': """
                <t t-name="template_menu">
                    <menu t-cache="None"><t t-out="counter"/></menu>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_menu', 'ir.ui.view', %s, 'base')", [template_menu.id])

        template_header = self.env['ir.ui.view'].create({
            'name': "template_header",
            'type': 'qweb',
            'arch': """
                <t t-name="template_header">
                    <header><t t-call="base.template_menu"/></header>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_header', 'ir.ui.view', %s, 'base')", [template_header.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <page t-cache="page_cache_id">
                        <t t-call="base.template_header"/>
                        <t t-out="counter"/>
                    </page>
                </t>
            """
        })

        render = template_page._render({
            'page_cache_id': 11,
            'counter': 'counter 11',
        })
        result = """
            <page>
                <header>
                    <menu>counter 11</menu>
                </header>
                counter 11
            </page>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1')

        render = template_page._render({
            'page_cache_id': 11,
            'counter': 'counter 11',
        })
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2 (equal 1)')

        render = template_page._render({
            'page_cache_id': 11,
            'counter': 'counter 33',
        })
        result = """
            <page>
                <header>
                    <menu>counter 33</menu>
                </header>
                counter 11
            </page>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3 (same cache, update value used in t-cache="None")')

        render = template_page._render({
            'page_cache_id': 44,
            'counter': 'counter 44',
        })
        result = """
            <page>
                <header>
                    <menu>counter 44</menu>
                </header>
                counter 44
            </page>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 4 (new cache key, new values)')

    def test_26_render_xml_cache_tcall_slave_update_then_tcall_no_cache_out0(self):
        """The counter value are wrapped into a cache and used inside a t-call"""

        template_menu = self.env['ir.ui.view'].create({
            'name': "template_menu",
            'type': 'qweb',
            'arch': """
                <t t-name="template_menu">
                    <menu t-cache="None"><t t-out="0"/> <t t-out="counter"/></menu>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_menu', 'ir.ui.view', %s, 'base')", [template_menu.id])

        template_header = self.env['ir.ui.view'].create({
            'name': "template_header",
            'type': 'qweb',
            'arch': """
                <t t-name="template_header">
                    <header>
                        <t t-call="base.template_menu"><h1>Mon titre: <t t-out="0"/></h1></t>
                    </header>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_header', 'ir.ui.view', %s, 'base')", [template_header.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <page t-cache="page_cache_id">
                        <t t-call="base.template_header"><t t-out="title"/></t>
                    </page>
                </t>
            """
        })

        render = template_page._render({
            'page_cache_id': 11,
            'counter': 'counter 11',
            'title': 'title 11',
        })
        result = """
            <page>
                <header>
                    <menu><h1>Mon titre: title 11</h1> counter 11</menu>
                </header>
            </page>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1')

        render = template_page._render({
            'page_cache_id': 11,
            'counter': 'counter 22',
            'title': 'title 22',
        })
        result = """
            <page>
                <header>
                    <menu><h1>Mon titre: title 11</h1> counter 22</menu>
                </header>
            </page>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2 (same cache, update value, t-out="0" with t-cache="None" use the cached gen0)')

        render = template_page._render({
            'page_cache_id': 33,
            'counter': 'counter 33',
            'title': 'title 33',
        })
        result = """
            <page>
                <header>
                    <menu><h1>Mon titre: title 33</h1> counter 33</menu>
                </header>
            </page>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3 (new cache key, new values)')

    def test_27_render_xml_cache_0_in_0_tcall_slave_update_value_in_first_tcall_slave_cache_no_cache_out0(self):
        template_layout = self.env['ir.ui.view'].create({
            'name': "template_layout",
            'type': 'qweb',
            'arch': """
                <t t-name="template_layout">
                    <html t-cache="True">
                        <body>
                            <t t-out="0" t-cache="None"/>
                        </body>
                    </html>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_layout', 'ir.ui.view', %s, 'base')", [template_layout.id])


        template_menu = self.env['ir.ui.view'].create({
            'name': "template_menu",
            'type': 'qweb',
            'arch': """
                <t t-name="template_menu">
                    <menu>
                        <div t-cache="None">
                            <title><t t-out="title"/></title>
                            <span t-out="menu_counter"/>
                        </div>
                        <div>
                            <menu-out t-out="0"/>
                        </div>
                    </menu>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_menu', 'ir.ui.view', %s, 'base')", [template_menu.id])


        template_header = self.env['ir.ui.view'].create({
            'name': "template_header",
            'type': 'qweb',
            'arch': """
                <t t-name="template_header">
                    <header>
                        <t t-set="menu_counter" t-value="menu_counter + 100"/>
                        <t t-set="val" t-cache="None"><h1>Mon titre: <t t-out="title"/></h1></t>
                        <t t-call="base.template_menu" t-set-title="val">
                            <t t-out="0"/>
                            header text
                        </t>
                    </header>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template_header', 'ir.ui.view', %s, 'base')", [template_header.id])


        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <t t-call="base.template_layout">
                        <page t-cache="page_cache_id">
                            <t t-call="base.template_header" t-set-title="template_page_record_title">
                                <span t-esc="template_page_record_html"/>
                            </t>
                            <div>
                                <span t-esc="template_page_record_name"/>
                                <span t-esc="template_page_counter" t-cache="None"/>
                            </div>
                        </page>
                    </t>
                </t>
            """
        })


        render = template_page._render({
            'menu_counter': 1,
            'page_cache_id': 11,
            'template_page_record_title': 'title 11',
            'template_page_record_name': 'name 11',
            'template_page_record_html': 'html 11',
            'template_page_counter': 1100,
        })
        result = """
            <html>
                <body>
                    <page>
                        <header>
                            <menu>
                                <div>
                                    <title><h1>Mon titre: title 11</h1></title>
                                    <span>101</span>
                                </div>
                                <div>
                                    <menu-out>
                                        <span>html 11</span>
                                        header text
                                    </menu-out>
                                </div>
                            </menu>
                        </header>
                        <div>
                            <span>name 11</span>
                            <span>1100</span>
                        </div>
                    </page>
                </body>
            </html>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), '1 != 101: should t-set +=100 called when create/use t-cache')

        render = template_page._render({
            'menu_counter': 1,
            'page_cache_id': 11,
            'template_page_record_title': 'title 22',
            'template_page_record_name': 'name 22',
            'template_page_record_html': 'html 22',
            'template_page_counter': 2200,
        })
        result = """
            <html>
                <body>
                    <page>
                        <header>
                            <menu>
                                <div>
                                    <title><h1>Mon titre: title 22</h1></title>
                                    <span>1</span>
                                </div>
                                <div>
                                    <menu-out>
                                        <span>html 11</span>
                                        header text
                                    </menu-out>
                                </div>
                            </menu>
                        </header>
                        <div>
                            <span>name 11</span>
                            <span>2200</span>
                        </div>
                    </page>
                </body>
            </html>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'use cache, counter 1 and not 101 because t-set +=100 are not called')

        render = template_page._render({
            'menu_counter': 2,
            'page_cache_id': 11,
            'template_page_record_title': 'title 33',
            'template_page_record_name': 'name 33',
            'template_page_record_html': 'html 33',
            'template_page_counter': 3300,
        })
        self.assertEqual(etree.fromstring(render), etree.fromstring("""
            <html>
                <body>
                    <page>
                        <header>
                            <menu>
                                <div>
                                    <title><h1>Mon titre: title 33</h1></title>
                                    <span>2</span>
                                </div>
                                <div>
                                    <menu-out>
                                        <span>html 11</span>
                                        header text
                                    </menu-out>
                                </div>
                            </menu>
                        </header>
                        <div>
                            <span>name 11</span>
                            <span>3300</span>
                        </div>
                    </page>
                </body>
            </html>
        """), 'update menu counter, use cache for record')

    def test_28_render_xml_cache_with_t_foreach(self):
        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <section>
                        <article t-foreach="articles" t-as="obj"><t t-cache="(cache_id, obj['id'])"><t t-out="obj['name']"/>:<t t-out="counter()"/></t></article>
                    </section>
                </t>
            """
        })

        counter = itertools.count()
        render = template_page._render({
            'cache_id': 1,
            'articles': [{'id': 10, 'name': 'n10'}, {'id': 20, 'name': 'n20'}, {'id': 30, 'name': 'n30'}],
            'counter': lambda: next(counter),
        })
        result = """
            <section>
                <article>n10:0</article>
                <article>n20:1</article>
                <article>n30:2</article>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1')

        render = template_page._render({
            'cache_id': 1,
            'articles': [{'id': 10, 'name': 'n11'}, {'id': 20, 'name': 'n21'}, {'id': 30, 'name': 'n31'}],
            'counter': lambda: next(counter),
        })
        result = """
            <section>
                <article>n10:0</article>
                <article>n20:1</article>
                <article>n30:2</article>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2 (value should be displayed from cache)')

        render = template_page._render({
            'cache_id': 2,
            'articles': [{'id': 10, 'name': 'n12'}, {'id': 20, 'name': 'n22'}, {'id': 30, 'name': 'n32'}],
            'counter': lambda: next(counter),
        })
        result = """
            <section>
                <article>n12:3</article>
                <article>n22:4</article>
                <article>n32:5</article>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3 (should use neew values)')

    def test_29_render_xml_cache_no_cache_with_t_foreach(self):
        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="template_page">
                    <section t-cache="True">
                        <article t-foreach="articles" t-as="obj" t-cache="None"><t t-cache="(cache_id, obj['id'])"><t t-out="obj['name']"/>:<t t-out="counter()"/></t></article>
                    </section>
                </t>
            """
        })

        counter = itertools.count()
        render = template_page._render({
            'cache_id': 1,
            'articles': [{'id': 10, 'name': 'n10'}, {'id': 20, 'name': 'n20'}, {'id': 30, 'name': 'n30'}],
            'counter': lambda: next(counter),
        })
        result = """
            <section>
                <article>n10:0</article>
                <article>n20:1</article>
                <article>n30:2</article>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 1')

        render = template_page._render({
            'cache_id': 1,
            'articles': [{'id': 10, 'name': 'n11'}, {'id': 20, 'name': 'n21'}, {'id': 30, 'name': 'n31'}],
            'counter': lambda: next(counter),
        })
        result = """
            <section>
                <article>n10:0</article>
                <article>n20:1</article>
                <article>n30:2</article>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 2 (value should be displayed from cache)')

        render = template_page._render({
            'cache_id': 2,
            'articles': [{'id': 10, 'name': 'n12'}, {'id': 20, 'name': 'n22'}, {'id': 30, 'name': 'n32'}],
            'counter': lambda: next(counter),
        })
        result = """
            <section>
                <article>n12:3</article>
                <article>n22:4</article>
                <article>n32:5</article>
            </section>
        """
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'rendering 3 (should use neew values)')

    def test_30_render_xml_nested_cache_t_call(self):
        template = self.env['ir.ui.view'].create({
            'name': "base.template",
            'type': 'qweb',
            'arch': """
                <t name="base.template">
                    <t t-out="0"/>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('template', 'ir.ui.view', %s, 'base')", [template.id])

        layout = self.env['ir.ui.view'].create({
            'name': "base.layout",
            'type': 'qweb',
            'arch': """
                <t name="base.layout">
                    <t t-cache="1">
                        <t t-cache="2">
                            <t t-call="base.template">
                                <h1>Layout</h1>
                            </t>
                        </t>
                    </t>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('layout', 'ir.ui.view', %s, 'base')", [layout.id])

        page = self.env['ir.ui.view'].create({
            'name': "base.page",
            'type': 'qweb',
            'arch': """
                <t name="base.page">
                    <t t-call="base.layout">
                        <h2>Base</h2>
                    </t>
                </t>
            """
        })

        render = page._render({})
        result = """<h1>Layout</h1>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'first rendering')

        render = page._render({})
        result = """<h1>Layout</h1>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result))

    def test_31_render_xml_cache_nested_t_call(self):
        post_author = self.env['ir.ui.view'].create({
            'name': "post_author",
            'type': 'qweb',
            'arch': """
                <t t-name="base.post_author">
                    <footer t-att-class="classname" t-cache="None"/>
                    <date t-if="not hide_date">2021</date>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('post_author', 'ir.ui.view', %s, 'base')", [post_author.id])

        record_cover = self.env['ir.ui.view'].create({
            'name': "record_cover",
            'type': 'qweb',
            'arch': """
                <t t-name="base.record_cover">
                    <header t-att-class="classname"><t t-out="record"/><t t-out="0"/></header>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('record_cover', 'ir.ui.view', %s, 'base')", [record_cover.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="base.template_page" t-cache="True">
                    <t t-if="value == 1" t-set="classes" t-value="'classname_1'"/>
                    <t t-if="value == 2" t-set="classes" t-value="'classname_2'"/>

                    <a href="#" t-attf-class="d-block #{classes or 'mb-2'}">
                        <t t-call="base.record_cover">
                            <t t-set="record" t-value="value"/>
                            <t t-set="classname" t-value="'cover_%s' % value"/>

                            <t t-if="True" t-call="base.post_author" t-cache="None">
                                <t t-set="classname" t-value="'author_%s' % value" t-cache="None"/>
                                <t t-set="hide_date" t-value="True"/>
                            </t>
                        </t>
                    </a>
                </t>
            """
        })

        render = template_page._render({
            'value': 1,
        })
        result = """
            <a href="#" class="d-block classname_1">
                <header class="cover_1">
                    1
                    <footer class="author_1"></footer>
                </header>
            </a>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'first rendering')

        render = template_page._render({
            'value': 2,
        })
        result = """
            <a href="#" class="d-block classname_1">
                <header class="cover_1">
                    1
                    <footer class="author_2"></footer>
                </header>
            </a>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result))

    def test_32_render_xml_cache_t_foreach_t_call(self):
        dummy = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <footer t-att-class="classname"><t t-out="num"/></footer>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [dummy.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="base.template_page">
                    <section t-cache="True">
                        <t t-foreach="[1,2,3]" t-as="num">
                            <t t-call="base.dummy">
                                <t t-set="classname" t-value="'test_%s' % num"/>
                            </t>
                        </t>
                    </section>
                </t>
            """
        })

        render = template_page._render()
        result = """
            <section>
                <footer class="test_1">1</footer>
                <footer class="test_2">2</footer>
                <footer class="test_3">3</footer>
            </section>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'first rendering')

        render = template_page._render()
        result = """
            <section>
                <footer class="test_1">1</footer>
                <footer class="test_2">2</footer>
                <footer class="test_3">3</footer>
            </section>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result))

    def test_32_render_xml_cache_None_t_call_t_set(self):
        dummy = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <footer t-att-class="classname"><t t-out="num"/></footer>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [dummy.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="base.template_page">
                    <section>
                        <t t-cache="None" t-call="base.dummy">
                            <t t-set="classname" t-value="'test_%s' % num"/>
                        </t>
                    </section>
                </t>
            """
        })

        render = template_page._render({'num': 1})
        result = """
            <section>
                <footer class="test_1">1</footer>
            </section>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'first rendering')

        render = template_page._render({'num': 2})
        result = """
            <section>
                <footer class="test_2">2</footer>
            </section>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result))

    def test_33_render_xml_cache_tcall_targ(self):
        dummy = self.env['ir.ui.view'].create({
            'name': "dummy",
            'type': 'qweb',
            'arch': """
                <t t-name="base.dummy">
                    <div><t t-cache="None" t-out="num"/></div>
                </t>
            """
        })
        self.env.cr.execute("INSERT INTO ir_model_data(name, model, res_id, module)"
                            "VALUES ('dummy', 'ir.ui.view', %s, 'base')", [dummy.id])

        template_page = self.env['ir.ui.view'].create({
            'name': "template_page",
            'type': 'qweb',
            'arch': """
                <t t-name="base.template_page">
                    <section t-cache="cache_id"><t t-call="base.dummy" t-set-num="a"/></section>
                </t>
            """
        })

        render = template_page._render({'cache_id': 1, 'a': 1})
        result = """
            <section>
                <div>1</div>
            </section>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result), 'first rendering')

        render = template_page._render({'cache_id': 1, 'a': 2})
        result = """
            <section>
                <div>2</div>
            </section>"""
        self.assertEqual(etree.fromstring(render), etree.fromstring(result))

class FileSystemLoader(object):
    def __init__(self, path):
        # TODO: support multiple files #add_file() + add cache
        self.path = path
        self.doc = etree.parse(path).getroot()

    def __iter__(self):
        for node in self.doc:
            name = node.get('t-name')
            if name:
                yield name

    def __call__(self, name, options):
        for node in self.doc:
            if node.get('t-name') == name:
                return (deepcopy(node), name)

class TestQWebStaticXml(TransactionCase):
    matcher = re.compile(r'^qweb-test-(.*)\.xml$')

    def test_render_nodb(self):
        """ Render an html page without db ans wihtout registry
        """
        expected = dedent("""
            <html>
                <head>
                    <title>Odoo</title>
                </head>
                <body>
                    <section class="toto">
                        <div>3</div>
                    </section>
                </body>
            </html>
        """).strip()

        templates = {
            'html': html.document_fromstring("""
                <html t-name="html">
                    <head>
                        <title>Odoo</title>
                    </head>
                    <body>
                        <section class="toto">
                            <t t-call="content"/>
                        </section>
                    </body>
                </html>
            """),
            'content': html.fragment_fromstring("""
                <t t-name="content">
                        <div><t t-out="val"/></div>
                </t>
            """)
        }
        def load(template_name, options):
            return (templates[template_name], template_name)
        rendering = render('html', {'val': 3}, load).strip()

        self.assertEqual(html.document_fromstring(rendering), html.document_fromstring(expected))

    @classmethod
    def get_cases(cls):
        path = cls.qweb_test_file_path()
        return (
            cls("test_qweb_{}".format(cls.matcher.match(f).group(1)))
            for f in os.listdir(path)
            # js inheritance
            if f != 'qweb-test-extend.xml'
            if cls.matcher.match(f)
        )

    @classmethod
    def qweb_test_file_path(cls):
        return os.path.dirname(get_module_resource('web', 'static', 'lib', 'qweb', 'qweb2.js'))

    def __getattr__(self, item):
        if not item.startswith('test_qweb_'):
            raise AttributeError("No {} on {}".format(item, self))

        f = 'qweb-test-{}.xml'.format(item[10:])
        path = self.qweb_test_file_path()

        return lambda: self.run_test_file(os.path.join(path, f))

    @mute_logger('odoo.addons.base.models.ir_qweb') # tests t-raw which is deprecated
    def run_test_file(self, path):
        self.env.user.tz = 'Europe/Brussels'
        doc = etree.parse(path).getroot()
        loader = FileSystemLoader(path)
        for template in loader:
            if not template or template.startswith('_'):
                continue
            param = doc.find('params[@id="{}"]'.format(template))
            # OrderedDict to ensure JSON mappings are iterated in source order
            # so output is predictable & repeatable
            params = {} if param is None else json.loads(param.text, object_pairs_hook=collections.OrderedDict)

            def remove_space(text):
                return re.compile(r'\>[ \n\t]*\<').sub('><', text.strip())

            result = remove_space(doc.find('result[@id="{}"]'.format(template)).text or u'').replace('&quot;', '&#34;')
            rendering = remove_space(self.env['ir.qweb']._render(template, values=params, load=loader))

            self.assertEqual(rendering, result, template)

            rendering_static = None
            try:
                rendering_static = remove_space(render(template, params, loader))
                self.assertEqual(rendering_static, result, "%s (static rendering)" % template)
            except QWebException as e:
                if not isinstance(e.__cause__, NotImplementedError) and "Please use \"env['ir.qweb']._render\" method" in str(e):
                    raise

def load_tests(loader, suite, _):
    # can't override TestQWebStaticXml.__dir__ because dir() called on *class* not
    # instance
    suite.addTests(TestQWebStaticXml.get_cases())
    return suite
