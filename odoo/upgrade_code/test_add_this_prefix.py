#!/usr/bin/env python3
"""
Tests for add_this_prefix codemod.

Run with: python -m pytest odoo/upgrade_code/test_add_this_prefix.py -v
"""

import json
import os
import tempfile
import textwrap
import unittest

from add_this_prefix import (
    build_inheritance_index,
    extract_xpath_attr_predicates,
    is_expression_attribute,
    prefix_properties_in_expression,
    process_changes,
    property_appears_in_expression,
    resolve_filepath,
    run_codemod,
    update_inheriting_xpaths,
)


class TestResolveFilepath(unittest.TestCase):
    """Test filename resolution from templatesInfos.json format to actual paths."""

    def setUp(self):
        self.addons_dirs = ["/fake/odoo/addons"]

    def test_empty_filename(self):
        self.assertIsNone(resolve_filepath("", self.addons_dirs))

    def test_xml_file(self):
        result = resolve_filepath(
            "/web/static/src/core/overlay/overlay_container.xml", self.addons_dirs
        )
        self.assertEqual(
            result, "/fake/odoo/addons/web/static/src/core/overlay/overlay_container.xml"
        )

    def test_js_module_standard(self):
        result = resolve_filepath("@web/core/main_components_container", self.addons_dirs)
        self.assertEqual(
            result, "/fake/odoo/addons/web/static/src/core/main_components_container.js"
        )

    def test_js_module_relative(self):
        result = resolve_filepath("@web/../lib/hoot/ui/hoot_main", self.addons_dirs)
        self.assertEqual(
            result, "/fake/odoo/addons/web/static/lib/hoot/ui/hoot_main.js"
        )

    def test_leading_slash_stripped(self):
        result = resolve_filepath("/web/static/tests/file.xml", self.addons_dirs)
        self.assertEqual(result, "/fake/odoo/addons/web/static/tests/file.xml")


class TestPropertyAppearsInExpression(unittest.TestCase):

    """Test whether a property identifier appears in an expression."""

    def test_simple_property(self):
        self.assertTrue(property_appears_in_expression("state", "state.show"))

    def test_property_standalone(self):
        self.assertTrue(property_appears_in_expression("sortedOverlays", "sortedOverlays"))

    def test_property_not_in_expression(self):
        self.assertFalse(property_appears_in_expression("props", "C[0]"))

    def test_property_already_prefixed(self):
        self.assertFalse(
            property_appears_in_expression("isRTL", "{'o_rtl': this.isRTL}")
        )

    def test_property_as_substring_not_matched(self):
        self.assertFalse(property_appears_in_expression("state", "runnerState.value"))

    def test_property_at_start_of_expression(self):
        self.assertTrue(
            property_appears_in_expression("state", "state.blockState === BLOCK_STATES.UNBLOCKED")
        )

    def test_property_negated(self):
        self.assertTrue(property_appears_in_expression("someFlag", "!someFlag"))

    def test_property_in_function_call(self):
        self.assertTrue(property_appears_in_expression("getClassName", "getClassName()"))

    def test_property_after_dot_not_matched(self):
        self.assertFalse(property_appears_in_expression("value", "state.value"))

    def test_property_multiple_occurrences(self):
        self.assertTrue(
            property_appears_in_expression(
                "uiState",
                "!uiState.statusFilter or uiState.statusFilter === 'passed' ? 'emerald' : 'gray'",
            )
        )

    def test_property_in_object_literal(self):
        self.assertTrue(
            property_appears_in_expression("state", "{ 'text-emerald': state.copied }")
        )

    def test_property_in_ternary(self):
        self.assertTrue(
            property_appears_in_expression("props", "props.hidden ? 'hidden' : 'flex'")
        )

    def test_property_in_brackets(self):
        self.assertTrue(
            property_appears_in_expression("runnerState", "runnerState['globalErrors']")
        )

    def test_property_inside_string_not_matched(self):
        """Tokenizer correctly skips identifiers inside string literals."""
        self.assertFalse(
            property_appears_in_expression("state", "'state is active'")
        )

    def test_object_key_not_matched(self):
        """Object keys like {state: val} should NOT match as root identifiers."""
        self.assertFalse(
            property_appears_in_expression("state", "{state: val}")
        )

    def test_arrow_param_not_matched(self):
        """Arrow function parameters should NOT match as root identifiers."""
        self.assertFalse(
            property_appears_in_expression("x", "items.map(x => x.name)")
        )


class TestPrefixPropertiesInExpression(unittest.TestCase):
    """Test adding 'this.' prefix to properties in expressions."""

    def test_simple_property(self):
        result = prefix_properties_in_expression("state.show", {"state"})
        self.assertEqual(result, "this.state.show")

    def test_standalone_property(self):
        result = prefix_properties_in_expression("sortedOverlays", {"sortedOverlays"})
        self.assertEqual(result, "this.sortedOverlays")

    def test_multiple_properties_same_expression(self):
        result = prefix_properties_in_expression(
            "state.blockState === BLOCK_STATES.UNBLOCKED",
            {"state", "BLOCK_STATES"},
        )
        self.assertEqual(result, "this.state.blockState === this.BLOCK_STATES.UNBLOCKED")

    def test_already_prefixed_not_doubled(self):
        result = prefix_properties_in_expression("{'o_rtl': this.isRTL}", {"isRTL"})
        self.assertEqual(result, "{'o_rtl': this.isRTL}")

    def test_negated_property(self):
        result = prefix_properties_in_expression("!someFlag", {"someFlag"})
        self.assertEqual(result, "!this.someFlag")

    def test_function_call(self):
        result = prefix_properties_in_expression("getClassName()", {"getClassName"})
        self.assertEqual(result, "this.getClassName()")

    def test_multiple_occurrences(self):
        result = prefix_properties_in_expression(
            "!uiState.statusFilter or uiState.statusFilter === 'passed' ? 'emerald' : 'gray'",
            {"uiState"},
        )
        self.assertEqual(
            result,
            "!this.uiState.statusFilter or this.uiState.statusFilter === 'passed' ? 'emerald' : 'gray'",
        )

    def test_property_in_brackets(self):
        result = prefix_properties_in_expression(
            "runnerState['globalErrors']", {"runnerState"}
        )
        self.assertEqual(result, "this.runnerState['globalErrors']")

    def test_property_with_comparison(self):
        result = prefix_properties_in_expression(
            "runnerState.status === 'running'", {"runnerState"}
        )
        self.assertEqual(result, "this.runnerState.status === 'running'")

    def test_object_literal_expression(self):
        result = prefix_properties_in_expression(
            "{ 'text-emerald': state.copied }", {"state"}
        )
        self.assertEqual(result, "{ 'text-emerald': this.state.copied }")

    def test_complex_expression_with_logical(self):
        result = prefix_properties_in_expression(
            "state.showDetails and !props.test.config.skip",
            {"state", "props"},
        )
        self.assertEqual(
            result, "this.state.showDetails and !this.props.test.config.skip"
        )

    def test_empty_properties_no_change(self):
        result = prefix_properties_in_expression("state.show", set())
        self.assertEqual(result, "state.show")

    def test_ternary_expression(self):
        result = prefix_properties_in_expression(
            "props.hidden ? 'hidden' : 'flex'", {"props"}
        )
        self.assertEqual(result, "this.props.hidden ? 'hidden' : 'flex'")

    def test_property_in_template_string(self):
        result = prefix_properties_in_expression(
            "{ id: props.job.id }", {"props"}
        )
        self.assertEqual(result, "{ id: this.props.job.id }")

    def test_arithmetic_expression(self):
        result = prefix_properties_in_expression(
            "uiState.resultsPage * uiState.resultsPerPage",
            {"uiState"},
        )
        self.assertEqual(
            result, "this.uiState.resultsPage * this.uiState.resultsPerPage"
        )

    def test_object_key_not_prefixed(self):
        """Object keys should NOT be prefixed, only values."""
        result = prefix_properties_in_expression(
            "{ state: state.value }", {"state"}
        )
        self.assertEqual(result, "{ state: this.state.value }")

    def test_arrow_param_not_prefixed(self):
        """Arrow function parameters should NOT be prefixed."""
        result = prefix_properties_in_expression(
            "items.map(x => x.name)", {"items"}
        )
        self.assertEqual(result, "this.items.map(x => x.name)")

    def test_shorthand_object(self):
        """Shorthand {prop} should prefix the value."""
        result = prefix_properties_in_expression(
            "{ state }", {"state"}
        )
        self.assertEqual(result, "{ this.state }")


class TestProcessChangesXML(unittest.TestCase):
    """Test processing changes on XML template files."""

    def _make_tempfile(self, content, suffix='.xml'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, dir=self.tmpdir
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_xml_symbols_preserved(self):
        """Test that > remains > and other symbols are handled correctly."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.Test">
                    <DropdownItem
                        onSelected="() => this.onSelected(item)"
                        onOther="a > b"
                    />
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [
            {
                'filename': '/test.xml',
                'templateName': 'web.Test',
                'property': 'item',
                'xpath': '',
                'expression': '() => this.onSelected(item)',
                'source': 'component',
            },
            {
                'filename': '/test.xml',
                'templateName': 'web.Test',
                'property': 'a',
                'xpath': '',
                'expression': 'a > b',
                'source': 'component',
            }
        ]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('onSelected="() => this.onSelected(this.item)"', result)
        self.assertIn('onOther="this.a > b"', result)
        # Verify tag didn't collapse
        self.assertIn('/>', result)

    def test_xml_tag_closing_preserved(self):
        """Test that surgical replacement preserves tag closing style."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.Test">
                    <div t-esc="value"></div>
                    <span t-esc="value"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.Test',
            'property': 'value',
            'xpath': '',
            'expression': 'value',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('<div t-esc="this.value"></div>', result)
        self.assertIn('<span t-esc="this.value"/>', result)

    def test_simple_xml_property(self):
        """Simple property access: state.value -> this.state.value"""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.MyComp">
                <div t-esc="state.value"/>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'state',
            'xpath': './div/@t-esc',
            'expression': 'state.value',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.state.value', result)
        self.assertNotIn('"state.value"', result)

    def test_multiple_properties_same_expression(self):
        """Two properties in one expression both get prefixed."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.BlockUI">
                <t t-if="state.blockState === BLOCK_STATES.UNBLOCKED">
                    <div/>
                </t>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [
            {
                'filename': '/test.xml',
                'templateName': 'web.BlockUI',
                'property': 'state',
                'xpath': './t/@t-if',
                'expression': 'state.blockState === BLOCK_STATES.UNBLOCKED',
                'source': 'component',
            },
            {
                'filename': '/test.xml',
                'templateName': 'web.BlockUI',
                'property': 'BLOCK_STATES',
                'xpath': './t/@t-if',
                'expression': 'state.blockState === BLOCK_STATES.UNBLOCKED',
                'source': 'component',
            },
        ]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.state.blockState === this.BLOCK_STATES.UNBLOCKED', result)

    def test_loop_variable_skipped(self):
        """t-as loop variables should NOT get 'this.' prefix."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.List">
                <t t-foreach="items" t-as="item" t-key="item.id">
                    <div t-esc="item.name"/>
                </t>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.List',
            'property': 'item',
            'xpath': './t/div/@t-esc',
            'expression': 'item.name',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertFalse(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('item.name', result)
        self.assertNotIn('this.item', result)

    def test_t_set_variable_skipped(self):
        """t-set variables should NOT get 'this.' prefix."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.MyComp">
                <t t-set="myVar" t-value="42"/>
                <div t-esc="myVar"/>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'myVar',
            'xpath': './div/@t-esc',
            'expression': 'myVar',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertFalse(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('"myVar"', result)
        self.assertNotIn('this.myVar', result)

    def test_standalone_property(self):
        """A standalone property (no dot access) gets prefixed."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.Overlay">
                <div>
                    <t t-foreach="sortedOverlays" t-as="overlay" t-key="overlay.id">
                    </t>
                </div>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.Overlay',
            'property': 'sortedOverlays',
            'xpath': './div/t/@t-foreach',
            'expression': 'sortedOverlays',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.sortedOverlays', result)

    def test_dry_run_does_not_modify(self):
        """Dry run reports changes but doesn't write to disk."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.MyComp">
                <div t-esc="state.value"/>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)

        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'state',
            'xpath': './div/@t-esc',
            'expression': 'state.value',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True, dry_run=True)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        # File should NOT be modified in dry-run
        self.assertIn('"state.value"', result)
        self.assertNotIn('this.state', result)

    def test_property_not_in_expression_skipped(self):
        """Properties that don't appear as identifiers in the expression are skipped."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.MyComp">
                <div t-esc="C[0]"/>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)

        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'props',
            'xpath': './div/@t-esc',
            'expression': 'C[0]',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertFalse(modified)

    def test_css_class_not_modified_in_t_attf(self):
        """Property names inside CSS class names in t-attf-* should NOT be prefixed.

        e.g. 'align-items-center' should NOT become 'align-this.items-center'
        even when 'items' is a reported property name.
        """
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.MyComp">
                <button t-attf-class="btn {{ getDecoration(value) }} d-flex align-items-center {{ additionalClass }}">
                    <div t-esc="display"/>
                </button>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)

        # 'items' is reported as a property but only exists inside a CSS class name
        # on this line. The codemod should NOT touch 'align-items-center'.
        # Empty xpath triggers skip, same behavior as old wrong-line mismatch.
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'items',
            'xpath': '',
            'expression': 'items',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        # Should NOT find/modify 'items' inside 'align-items-center'
        with open(filepath) as f:
            result = f.read()
        self.assertIn('align-items-center', result)
        self.assertNotIn('align-this.items-center', result)


class TestProcessChangesJS(unittest.TestCase):
    """Test processing changes on JS files with inline XML templates."""

    def _make_tempfile(self, content, suffix='.js'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, dir=self.tmpdir
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_js_inline_template(self):
        """Multi-line JS inline template: notifications -> this.notifications"""
        content = textwrap.dedent("""\
            import { Component, xml } from "@odoo/owl";

            export class MyComp extends Component {
                static template = xml`
                    <div class="container">
                        <t t-foreach="notifications" t-as="n" t-key="n">
                            <span t-esc="n"/>
                        </t>
                    </div>
                `;
                setup() {
                    this.notifications = [];
                }
            }""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '@web/core/my_comp',
            'templateName': '@web/core/my_comp:MyComp',
            'property': 'notifications',
            'xpath': './div/t/@t-foreach',
            'expression': 'notifications',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=False)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.notifications', result)

    def test_js_loop_variable_skipped(self):
        """Loop variable C from t-as='C' should NOT get prefixed."""
        content = textwrap.dedent("""\
            import { Component, xml } from "@odoo/owl";

            export class MyComp extends Component {
                static template = xml`
                    <div>
                        <t t-foreach="Components.entries" t-as="C" t-key="C[0]">
                            <t t-component="C[1].Component" t-props="C[1].props"/>
                        </t>
                    </div>
                `;
            }""")
        filepath = self._make_tempfile(content)
        changes = [
            {
                'filename': '@web/core/my_comp',
                'templateName': '@web/core/my_comp:MyComp',
                'property': 'Components',
                'xpath': './div/t/@t-foreach',
                'expression': 'Components.entries',
                'source': 'component',
            },
            {
                'filename': '@web/core/my_comp',
                'templateName': '@web/core/my_comp:MyComp',
                'property': 'C',
                'xpath': './div/t/t/@t-component',
                'expression': 'C[1].Component',
                'source': 'component',
            },
        ]

        modified, messages, _ = process_changes(filepath, changes, is_xml=False)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        # Components should be prefixed
        self.assertIn('this.Components.entries', result)
        # C is a t-as loop variable, should NOT be prefixed
        # (check that 'this.C[' doesn't appear - 'this.C' is a substring of 'this.Components')
        self.assertNotIn('this.C[', result)
        self.assertNotIn('this.C"', result)
        self.assertIn('C[1].Component', result)

    def test_js_single_line_template(self):
        """Single-line JS template with col offset from xml`."""
        content = textwrap.dedent("""\
            import { Component, xml } from "@odoo/owl";

            export class Transition extends Component {
                static template = xml`<t t-slot="default" t-if="transition.shouldMount" className="transition.className"/>`;
            }""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '@web/core/transition',
            'templateName': '@web/core/transition:Transition',
            'property': 'transition',
            'xpath': './t/@t-if',
            'expression': 'transition.shouldMount',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=False)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.transition.shouldMount', result)

    def test_js_multiple_classes(self):
        """When a file has multiple classes, the correct template is found."""
        content = textwrap.dedent("""\
            import { Component, xml } from "@odoo/owl";

            class First extends Component {
                static template = xml`<div t-esc="value1"/>`;
            }

            class Second extends Component {
                static template = xml`<div t-esc="value2"/>`;
            }""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '@web/module',
            'templateName': '@web/module:Second',
            'property': 'value2',
            'xpath': './div/@t-esc',
            'expression': 'value2',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=False)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        # value2 in Second's template should be prefixed
        self.assertIn('this.value2', result)
        # value1 in First's template should NOT be changed
        self.assertIn('"value1"', result)
        self.assertNotIn('this.value1', result)

    def test_js_property_already_has_this(self):
        """Properties already prefixed with 'this.' are not double-prefixed."""
        content = textwrap.dedent("""\
            import { Component, xml } from "@odoo/owl";

            export class MyComp extends Component {
                static template = xml`
                    <div t-att-class="{'o_rtl': this.isRTL}">
                    </div>
                `;
            }""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '@web/module',
            'templateName': '@web/module:MyComp',
            'property': 'isRTL',
            'xpath': './div/@t-att-class',
            'expression': "{'o_rtl': this.isRTL}",
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=False)
        self.assertFalse(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertNotIn('this.this.', result)
        self.assertIn("this.isRTL", result)


class TestProcessChangesInheritedTemplate(unittest.TestCase):

    """Test handling of t-inherit templates."""

    def _make_tempfile(self, content, suffix='.xml'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, dir=self.tmpdir
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_t_inherit_template_found(self):
        """Templates using t-inherit should be found by template name."""
        content = textwrap.dedent("""\
            <?xml version="1.0" encoding="UTF-8"?>
            <templates xml:space="preserve">
                <t t-inherit="web.BaseTemplate" t-inherit-mode="extension">
                    <xpath expr="div" position="inside">
                        <em t-esc="extensionValue"/>
                    </xpath>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)

        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.BaseTemplate',
            'property': 'extensionValue',
            'xpath': './xpath/em/@t-esc',
            'expression': 'extensionValue',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.extensionValue', result)


class TestProcessChangesSlotScope(unittest.TestCase):
    """Test that t-slot-scope variables are properly excluded."""

    def _make_tempfile(self, content, suffix='.xml'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, dir=self.tmpdir
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_slot_scope_variable_skipped(self):
        """t-slot-scope variables should NOT get 'this.' prefix."""
        content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <templates>
            <t t-name="web.MyComp">
                <Transition t-slot-scope="transition">
                    <div t-att-class="transition.className"/>
                </Transition>
            </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'transition',
            'xpath': './transition/div/@t-att-class',
            'expression': 'transition.className',
            'source': 'component',
        }]

        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertFalse(modified)

        with open(filepath) as f:
            result = f.read()
        self.assertNotIn('this.transition', result)


class TestIsExpressionAttribute(unittest.TestCase):
    """Test classification of OWL template attributes as expression vs string."""

    def test_expression_directives(self):
        for attr in ['t-if', 't-elif', 't-esc', 't-out', 't-foreach',
                      't-key', 't-memo', 't-value', 't-att', 't-model',
                      't-tag', 't-log', 't-portal', 't-component', 't-props']:
            self.assertTrue(
                is_expression_attribute(attr, 'div'),
                f"{attr} should be an expression attribute",
            )

    def test_expression_prefixes(self):
        self.assertTrue(is_expression_attribute('t-att-class', 'div'))
        self.assertTrue(is_expression_attribute('t-att-style', 'span'))
        self.assertTrue(is_expression_attribute('t-on-click', 'button'))
        self.assertTrue(is_expression_attribute('t-on-click.stop', 'button'))

    def test_attf_returns_attf(self):
        result = is_expression_attribute('t-attf-class', 'div')
        self.assertEqual(result, 'attf')

    def test_string_directives(self):
        for attr in ['t-name', 't-set', 't-as', 't-ref', 't-call', 't-slot',
                      't-inherit', 't-inherit-mode', 't-set-slot', 't-slot-scope',
                      't-translation', 't-source-file']:
            self.assertFalse(
                is_expression_attribute(attr, 'div'),
                f"{attr} should NOT be an expression attribute",
            )

    def test_custom_directives_are_strings(self):
        self.assertFalse(is_expression_attribute('t-custom-ref', 'button'))
        self.assertFalse(is_expression_attribute('t-custom-click', 'button'))

    def test_html_attributes_not_expressions(self):
        self.assertFalse(is_expression_attribute('class', 'div'))
        self.assertFalse(is_expression_attribute('data-hotkey', 'button'))
        self.assertFalse(is_expression_attribute('aria-label', 'button'))
        self.assertFalse(is_expression_attribute('data-tooltip', 'button'))

    def test_component_props_are_expressions(self):
        self.assertTrue(is_expression_attribute('menuClass', 'Dropdown'))
        self.assertTrue(is_expression_attribute('beforeOpen.bind', 'Dropdown'))
        self.assertTrue(is_expression_attribute('onSelected', 'DropdownItem'))

    def test_component_detection_by_dot(self):
        self.assertTrue(is_expression_attribute('value', 'my.Component'))


class TestStringAttributeNotModified(unittest.TestCase):
    """Test that string-only attributes are not modified even when their
    value matches an expression from another attribute."""

    def _make_tempfile(self, content, suffix='.xml'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, dir=self.tmpdir
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_t_custom_ref_not_modified(self):
        """t-custom-ref='save' should NOT become 'this.save'."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.FormStatusIndicator">
                    <button
                        type="button"
                        class="btn"
                        data-hotkey="s"
                        t-on-click.stop="save"
                        data-tooltip="Save manually"
                        aria-label="Save manually"
                        t-custom-ref="save">
                    </button>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.FormStatusIndicator',
            'property': 'save',
            'xpath': './button/@t-on-click.stop',
            'expression': 'save',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        # t-on-click.stop should be prefixed
        self.assertIn('t-on-click.stop="this.save"', result)
        # t-custom-ref should NOT be modified
        self.assertIn('t-custom-ref="save"', result)
        # Other string attributes should NOT be modified
        self.assertIn('data-hotkey="s"', result)
        self.assertIn('aria-label="Save manually"', result)

    def test_t_ref_not_modified(self):
        """t-ref='myRef' should NOT become 'this.myRef'."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <input t-ref="myRef" t-att-value="myRef"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'myRef',
            'xpath': './input/@t-att-value',
            'expression': 'myRef',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('t-att-value="this.myRef"', result)
        self.assertIn('t-ref="myRef"', result)

    def test_t_set_not_modified(self):
        """t-set='varName' should NOT be prefixed even when varName is a property."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <t t-set="state" t-value="state"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'state',
            'xpath': './t/@t-value',
            'expression': 'state',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        # t-value="state" should become t-value="this.state" but
        # after processing, "state" becomes a ctx var so it's skipped.
        with open(filepath) as f:
            result = f.read()
        # t-set should always keep its string value
        self.assertIn('t-set="state"', result)

    def test_t_name_not_modified(self):
        """t-name should never be modified."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="state">
                    <div t-esc="state"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'state',
            'property': 'state',
            'xpath': './div/@t-esc',
            'expression': 'state',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('t-name="state"', result)

    def test_component_props_are_modified(self):
        """Non-t-* attrs on component elements (uppercase tag) ARE expressions."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <DropdownItem onSelected="handler"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'handler',
            'xpath': './DropdownItem/@onSelected',
            'expression': 'handler',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('onSelected="this.handler"', result)


class TestAttfProcessing(unittest.TestCase):
    """Test handling of t-attf-* format string attributes."""

    def _make_tempfile(self, content, suffix='.xml'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, dir=self.tmpdir
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_attf_expression_prefixed(self):
        """Expressions inside {{}} in t-attf-* get this. prefix."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <div t-attf-class="btn {{ additionalClass }}"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'additionalClass',
            'xpath': '',
            'expression': 'additionalClass',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('{{ this.additionalClass }}', result)
        # Literal parts should be preserved
        self.assertIn('btn ', result)

    def test_attf_multiple_expressions(self):
        """Multiple expressions in t-attf-* are all processed."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <div t-attf-class="btn {{ getDecoration(value) }} d-flex {{ additionalClass }}"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [
            {
                'filename': '/test.xml',
                'templateName': 'web.MyComp',
                'property': 'additionalClass',
                'xpath': '',
                'expression': 'additionalClass',
                'source': 'component',
            },
            {
                'filename': '/test.xml',
                'templateName': 'web.MyComp',
                'property': 'getDecoration',
                'xpath': '',
                'expression': 'getDecoration(value)',
                'source': 'component',
            },
            {
                'filename': '/test.xml',
                'templateName': 'web.MyComp',
                'property': 'value',
                'xpath': '',
                'expression': 'getDecoration(value)',
                'source': 'component',
            },
        ]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('this.getDecoration(this.value)', result)
        self.assertIn('this.additionalClass', result)
        self.assertIn('d-flex', result)

    def test_attf_hash_interpolation(self):
        """#{expr} interpolation in t-attf-* is also handled."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <a t-attf-href="/page/#{pageNum}"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'pageNum',
            'xpath': '',
            'expression': 'pageNum',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        self.assertIn('#{this.pageNum}', result)

    def test_attf_no_expressions_no_change(self):
        """t-attf-* with no interpolation blocks is not modified."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <div t-attf-class="btn btn-primary"/>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [{
            'filename': '/test.xml',
            'templateName': 'web.MyComp',
            'property': 'btn',
            'xpath': '',
            'expression': 'btn',
            'source': 'component',
        }]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertFalse(modified)

    def test_attf_literal_parts_not_touched(self):
        """CSS class names in literal parts of t-attf-* are never modified."""
        content = textwrap.dedent("""\
            <templates>
                <t t-name="web.MyComp">
                    <button t-attf-class="btn d-flex align-items-center {{ additionalClass }}">
                        <div t-esc="items"/>
                    </button>
                </t>
            </templates>""")
        filepath = self._make_tempfile(content)
        changes = [
            {
                'filename': '/test.xml',
                'templateName': 'web.MyComp',
                'property': 'items',
                'xpath': './button/div/@t-esc',
                'expression': 'items',
                'source': 'component',
            },
        ]
        modified, messages, _ = process_changes(filepath, changes, is_xml=True)
        self.assertTrue(modified)
        with open(filepath) as f:
            result = f.read()
        # t-esc should be prefixed
        self.assertIn('t-esc="this.items"', result)
        # CSS class name should NOT be touched
        self.assertIn('align-items-center', result)
        self.assertNotIn('align-this.items', result)


class TestRunCodemodEndToEnd(unittest.TestCase):
    """End-to-end tests using run_codemod with a temporary directory structure."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def _write_file(self, rel_path, content):
        full_path = os.path.join(self.tmpdir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)
        return full_path

    def _read_file(self, rel_path):
        with open(os.path.join(self.tmpdir, rel_path)) as f:
            return f.read()

    def test_end_to_end_xml_file(self):
        """XML file with multiple properties in one expression."""
        self._write_file(
            'addons/web/static/src/core/block_ui.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.BlockUI">
                    <t t-if="state.blockState === BLOCK_STATES.UNBLOCKED">
                        <div/>
                    </t>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/block_ui.xml",
                    "templateName": "web.BlockUI",
                    "property": "state",
                    "xpath": "./t/@t-if",
                    "expression": "state.blockState === BLOCK_STATES.UNBLOCKED",
                    "source": "component",
                },
                "key2": {
                    "filename": "/web/static/src/core/block_ui.xml",
                    "templateName": "web.BlockUI",
                    "property": "BLOCK_STATES",
                    "xpath": "./t/@t-if",
                    "expression": "state.blockState === BLOCK_STATES.UNBLOCKED",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/block_ui.xml')
        self.assertEqual(files_modified, 1)
        self.assertIn('this.state.blockState === this.BLOCK_STATES.UNBLOCKED', result)

    def test_end_to_end_js_file(self):
        """JS inline template with component property and loop variable."""
        self._write_file(
            'addons/web/static/src/core/notification_container.js',
            textwrap.dedent("""\
                import { Component, xml } from "@odoo/owl";

                export class NotificationContainer extends Component {
                    static template = xml`
                        <div class="o_notification_manager">
                            <t t-foreach="notifications" t-as="notification" t-key="notification">
                                <span t-esc="notification"/>
                            </t>
                        </div>`;
                }"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "@web/core/notification_container",
                    "templateName": "@web/core/notification_container:NotificationContainer",
                    "property": "notifications",
                    "xpath": "./div/t/@t-foreach",
                    "expression": "notifications",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/notification_container.js')
        self.assertEqual(files_modified, 1)
        self.assertIn('this.notifications', result)
        self.assertIn('t-as="notification"', result)

    def test_end_to_end_ctx_entries_ignored(self):
        """Entries with source='ctx' are not processed."""
        self._write_file(
            'addons/web/static/src/core/my_comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.MyComp">
                    <div t-esc="ctxVar.value"/>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/my_comp.xml",
                    "templateName": "web.MyComp",
                    "property": "ctxVar",
                    "xpath": "./div/@t-esc",
                    "expression": "ctxVar.value",
                    "source": "ctx",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/my_comp.xml')
        self.assertEqual(files_modified, 0)
        self.assertNotIn('this.ctxVar', result)

    def test_end_to_end_empty_filename_skipped(self):
        """Entries with empty filename are skipped with a message."""
        json_data = {
            "accesses": {
                "key1": {
                    "filename": "",
                    "templateName": "__template__10",
                    "property": "state",
                    "xpath": "./t/@t-esc",
                    "expression": "state",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        self.assertEqual(files_modified, 0)
        self.assertTrue(any('empty filename' in m for m in messages))

    def test_end_to_end_dry_run(self):
        """Dry run shows changes without modifying files."""
        self._write_file(
            'addons/web/static/src/core/block_ui.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.BlockUI">
                    <div t-esc="state.value"/>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/block_ui.xml",
                    "templateName": "web.BlockUI",
                    "property": "state",
                    "xpath": "./div/@t-esc",
                    "expression": "state.value",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=True, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/block_ui.xml')
        self.assertNotIn('this.state', result)
        self.assertIn('state.value', result)

    def test_end_to_end_multiple_expressions_same_line(self):
        """Multiple expressions on the same line both get processed."""
        self._write_file(
            'addons/web/static/src/core/comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.Comp">
                    <div t-if="flagA" t-esc="flagB"/>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/comp.xml",
                    "templateName": "web.Comp",
                    "property": "flagA",
                    "xpath": "./div/@t-if",
                    "expression": "flagA",
                    "source": "component",
                },
                "key2": {
                    "filename": "/web/static/src/core/comp.xml",
                    "templateName": "web.Comp",
                    "property": "flagB",
                    "xpath": "./div/@t-esc",
                    "expression": "flagB",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/comp.xml')
        self.assertEqual(files_modified, 1)
        self.assertIn('this.flagA', result)
        self.assertIn('this.flagB', result)

    def test_end_to_end_source_both_skipped(self):
        """Entries with source='both' are SKIPPED."""
        self._write_file(
            'addons/web/static/src/core/comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.Comp">
                    <div t-esc="sharedProp"/>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/comp.xml",
                    "templateName": "web.Comp",
                    "property": "sharedProp",
                    "xpath": "./div/@t-esc",
                    "expression": "sharedProp",
                    "source": "both",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/comp.xml')
        self.assertEqual(files_modified, 0)
        self.assertNotIn('this.sharedProp', result)
        self.assertIn('sharedProp', result)

    def test_end_to_end_function_call_expression(self):
        """Function call expressions get prefixed: getCounterInfo() -> this.getCounterInfo()"""
        self._write_file(
            'addons/web/static/src/core/comp.js',
            textwrap.dedent("""\
                import { Component, xml } from "@odoo/owl";

                export class MyComp extends Component {
                    static template = xml`
                        <div t-esc="getCounterInfo()"/>
                    `;
                }"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "@web/core/comp",
                    "templateName": "@web/core/comp:MyComp",
                    "property": "getCounterInfo",
                    "xpath": "./div/@t-esc",
                    "expression": "getCounterInfo()",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/comp.js')
        self.assertEqual(files_modified, 1)
        self.assertIn('this.getCounterInfo()', result)

    def test_end_to_end_negated_expression(self):
        """Negated expression: !isDisabled -> !this.isDisabled"""
        self._write_file(
            'addons/web/static/src/core/comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.Comp">
                    <div t-if="!isDisabled"/>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/comp.xml",
                    "templateName": "web.Comp",
                    "property": "isDisabled",
                    "xpath": "./div/@t-if",
                    "expression": "!isDisabled",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/comp.xml')
        self.assertEqual(files_modified, 1)
        self.assertIn('!this.isDisabled', result)

    def test_end_to_end_hoot_relative_path(self):
        """@web/../lib/hoot/... paths resolve correctly."""
        self._write_file(
            'addons/web/static/lib/hoot/ui/hoot_buttons.js',
            textwrap.dedent("""\
                import { Component, xml } from "@odoo/owl";

                export class HootButtons extends Component {
                    static template = xml`
                        <div>
                            <button t-if="runnerState.status === 'running'"/>
                        </div>
                    `;
                }"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "@web/../lib/hoot/ui/hoot_buttons",
                    "templateName": "@web/../lib/hoot/ui/hoot_buttons:HootButtons",
                    "property": "runnerState",
                    "xpath": "./div/button/@t-if",
                    "expression": "runnerState.status === 'running'",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/lib/hoot/ui/hoot_buttons.js')
        self.assertEqual(files_modified, 1)
        self.assertIn("this.runnerState.status === 'running'", result)

    def test_end_to_end_t_as_derived_variable_skipped(self):
        """Derived loop variables like item_index are also skipped."""
        self._write_file(
            'addons/web/static/src/core/comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.Comp">
                    <t t-foreach="items" t-as="item" t-key="item_index">
                        <div t-esc="item_index"/>
                    </t>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/core/comp.xml",
                    "templateName": "web.Comp",
                    "property": "item_index",
                    "xpath": "./t/div/@t-esc",
                    "expression": "item_index",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path
        )

        result = self._read_file('addons/web/static/src/core/comp.xml')
        self.assertEqual(files_modified, 0)
        self.assertNotIn('this.item_index', result)


class TestExtractXpathAttrPredicates(unittest.TestCase):
    """Test XPath tokenizer for extracting attribute predicates."""

    def test_simple_equality_single_quotes(self):
        result = extract_xpath_attr_predicates("//t[@t-if='state.printItems.length']")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['type'], 'eq')
        self.assertEqual(result[0]['attr_name'], 't-if')
        self.assertEqual(result[0]['value'], 'state.printItems.length')
        self.assertEqual(result[0]['quote_char'], "'")

    def test_simple_equality_double_quotes(self):
        result = extract_xpath_attr_predicates('//div[@class="my-class"]')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['type'], 'eq')
        self.assertEqual(result[0]['attr_name'], 'class')
        self.assertEqual(result[0]['value'], 'my-class')
        self.assertEqual(result[0]['quote_char'], '"')

    def test_equality_with_child_step(self):
        result = extract_xpath_attr_predicates(
            "//t[@t-if='state.printItems.length']/Dropdown"
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['attr_name'], 't-if')
        self.assertEqual(result[0]['value'], 'state.printItems.length')

    def test_multiple_predicates(self):
        result = extract_xpath_attr_predicates(
            "//div[@class='foo'][@t-if='bar']"
        )
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['attr_name'], 'class')
        self.assertEqual(result[0]['value'], 'foo')
        self.assertEqual(result[1]['attr_name'], 't-if')
        self.assertEqual(result[1]['value'], 'bar')

    def test_contains_predicate(self):
        result = extract_xpath_attr_predicates(
            "//div[contains(@class, 'my-class')]"
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['type'], 'contains')
        self.assertEqual(result[0]['attr_name'], 'class')
        self.assertEqual(result[0]['value'], 'my-class')

    def test_no_predicates(self):
        result = extract_xpath_attr_predicates("//div/span")
        self.assertEqual(result, [])

    def test_position_tracking(self):
        """Verify that value_start/value_end allow surgical replacement."""
        xpath = "//t[@t-if='old_value']/Dropdown"
        result = extract_xpath_attr_predicates(xpath)
        self.assertEqual(len(result), 1)
        pred = result[0]
        # The positions should cover the quoted string including quotes
        self.assertEqual(xpath[pred['value_start']:pred['value_end']],
                         "'old_value'")
        # Surgical replacement: swap inner value
        new_xpath = (xpath[:pred['value_start'] + 1] +
                     'new_value' +
                     xpath[pred['value_end'] - 1:])
        self.assertEqual(new_xpath, "//t[@t-if='new_value']/Dropdown")

    def test_hasclass_not_extracted(self):
        """hasclass() is not an attribute predicate — should return empty."""
        result = extract_xpath_attr_predicates(
            "//div[hasclass('o_cp_action_menus')]"
        )
        self.assertEqual(result, [])

    def test_name_predicate(self):
        result = extract_xpath_attr_predicates("//field[@name='product_id']")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['attr_name'], 'name')
        self.assertEqual(result[0]['value'], 'product_id')


class TestBuildInheritanceIndex(unittest.TestCase):
    """Test building the inheritance index from XML files."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def _write_file(self, rel_path, content):
        full_path = os.path.join(self.tmpdir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)
        return full_path

    def test_single_inheriting_template(self):
        self._write_file(
            'web/static/src/views/list/list_cog_menu.xml',
            textwrap.dedent("""\
                <?xml version="1.0" encoding="UTF-8"?>
                <templates xml:space="preserve">
                    <t t-name="web.ListCogMenu" t-inherit="web.CogMenu">
                        <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                            <div role="separator" class="dropdown-divider"/>
                        </xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        self.assertIn('web.CogMenu', index)
        inheritors = index['web.CogMenu']
        self.assertEqual(len(inheritors), 1)
        self.assertEqual(inheritors[0]['child_template_name'], 'web.ListCogMenu')
        self.assertEqual(len(inheritors[0]['xpath_exprs']), 1)
        self.assertEqual(
            inheritors[0]['xpath_exprs'][0]['expr'],
            "//t[@t-if='state.printItems.length']/Dropdown",
        )

    def test_multiple_inheriting_templates(self):
        for name in ['list', 'kanban']:
            self._write_file(
                f'web/static/src/views/{name}/{name}_cog_menu.xml',
                textwrap.dedent(f"""\
                    <?xml version="1.0" encoding="UTF-8"?>
                    <templates xml:space="preserve">
                        <t t-name="web.{name.title()}CogMenu" t-inherit="web.CogMenu">
                            <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                                <div/>
                            </xpath>
                        </t>
                    </templates>"""),
            )

        index = build_inheritance_index([self.tmpdir])
        self.assertEqual(len(index['web.CogMenu']), 2)

    def test_template_with_no_xpath(self):
        """Templates that inherit but have no xpath children are still included."""
        self._write_file(
            'web/static/src/views/comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0" encoding="UTF-8"?>
                <templates>
                    <t t-name="web.Child" t-inherit="web.Parent">
                        <div>No xpath here</div>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        self.assertIn('web.Parent', index)
        self.assertEqual(index['web.Parent'][0]['xpath_exprs'], [])

    def test_non_xml_files_ignored(self):
        self._write_file('web/static/src/comp.js', 'not xml')
        index = build_inheritance_index([self.tmpdir])
        self.assertEqual(index, {})

    def test_multiple_addons_dirs(self):
        dir1 = os.path.join(self.tmpdir, 'addons1')
        dir2 = os.path.join(self.tmpdir, 'addons2')
        os.makedirs(dir1)
        os.makedirs(dir2)

        self._write_file(
            'addons1/web/comp.xml',
            textwrap.dedent("""\
                <templates>
                    <t t-name="web.Child1" t-inherit="web.Base">
                        <xpath expr="//div[@t-if='val']" position="after"><span/></xpath>
                    </t>
                </templates>"""),
        )
        self._write_file(
            'addons2/custom/comp.xml',
            textwrap.dedent("""\
                <templates>
                    <t t-name="custom.Child2" t-inherit="web.Base">
                        <xpath expr="//div[@t-if='val']" position="before"><em/></xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([dir1, dir2])
        self.assertEqual(len(index['web.Base']), 2)


class TestUpdateInheritingXpaths(unittest.TestCase):
    """Test cascading XPath updates in inheriting templates."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def _write_file(self, rel_path, content):
        full_path = os.path.join(self.tmpdir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)
        return full_path

    def _read_file(self, rel_path):
        with open(os.path.join(self.tmpdir, rel_path)) as f:
            return f.read()

    def test_single_xpath_updated(self):
        """A single inheriting template's XPath is updated."""
        filepath = self._write_file(
            'web/list_cog_menu.xml',
            textwrap.dedent("""\
                <?xml version="1.0" encoding="UTF-8"?>
                <templates xml:space="preserve">
                    <t t-name="web.ListCogMenu" t-inherit="web.CogMenu">
                        <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                            <div role="separator" class="dropdown-divider"/>
                        </xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        attr_changes = [{
            'template_name': 'web.CogMenu',
            'attr_name': 't-if',
            'old_value': 'state.printItems.length',
            'new_value': 'this.state.printItems.length',
        }]

        files_modified, changes_count, messages = update_inheriting_xpaths(
            index, attr_changes, dry_run=False
        )

        result = self._read_file('web/list_cog_menu.xml')
        self.assertEqual(files_modified, 1)
        self.assertEqual(changes_count, 1)
        self.assertIn("this.state.printItems.length", result)
        self.assertNotIn("@t-if='state.printItems.length'", result)
        self.assertIn("@t-if='this.state.printItems.length'", result)

    def test_multiple_inheritors_updated(self):
        """Multiple inheriting templates get updated."""
        for name in ['list', 'kanban', 'form']:
            self._write_file(
                f'web/{name}_cog_menu.xml',
                textwrap.dedent(f"""\
                    <?xml version="1.0" encoding="UTF-8"?>
                    <templates xml:space="preserve">
                        <t t-name="web.{name.title()}CogMenu" t-inherit="web.CogMenu">
                            <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                                <div/>
                            </xpath>
                        </t>
                    </templates>"""),
            )

        index = build_inheritance_index([self.tmpdir])
        attr_changes = [{
            'template_name': 'web.CogMenu',
            'attr_name': 't-if',
            'old_value': 'state.printItems.length',
            'new_value': 'this.state.printItems.length',
        }]

        files_modified, changes_count, messages = update_inheriting_xpaths(
            index, attr_changes, dry_run=False
        )

        self.assertEqual(files_modified, 3)
        self.assertEqual(changes_count, 3)
        for name in ['list', 'kanban', 'form']:
            result = self._read_file(f'web/{name}_cog_menu.xml')
            self.assertIn("@t-if='this.state.printItems.length'", result)

    def test_dry_run_no_modification(self):
        """Dry run reports changes but doesn't modify files."""
        self._write_file(
            'web/list_cog_menu.xml',
            textwrap.dedent("""\
                <?xml version="1.0" encoding="UTF-8"?>
                <templates xml:space="preserve">
                    <t t-name="web.ListCogMenu" t-inherit="web.CogMenu">
                        <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                            <div/>
                        </xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        attr_changes = [{
            'template_name': 'web.CogMenu',
            'attr_name': 't-if',
            'old_value': 'state.printItems.length',
            'new_value': 'this.state.printItems.length',
        }]

        files_modified, changes_count, messages = update_inheriting_xpaths(
            index, attr_changes, dry_run=True
        )

        self.assertEqual(files_modified, 1)
        result = self._read_file('web/list_cog_menu.xml')
        # File should NOT be modified
        self.assertIn("@t-if='state.printItems.length'", result)
        self.assertNotIn("this.state", result)

    def test_no_match_no_update(self):
        """XPaths that don't match the changed attribute are left alone."""
        self._write_file(
            'web/comp.xml',
            textwrap.dedent("""\
                <templates>
                    <t t-name="web.Child" t-inherit="web.Parent">
                        <xpath expr="//div[@class='foo']" position="after">
                            <span/>
                        </xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        attr_changes = [{
            'template_name': 'web.Parent',
            'attr_name': 't-if',
            'old_value': 'state.value',
            'new_value': 'this.state.value',
        }]

        files_modified, changes_count, messages = update_inheriting_xpaths(
            index, attr_changes, dry_run=False
        )

        self.assertEqual(files_modified, 0)
        self.assertEqual(changes_count, 0)

    def test_contains_predicate_warning(self):
        """contains() predicates generate a warning, not an auto-update."""
        self._write_file(
            'web/comp.xml',
            textwrap.dedent("""\
                <templates>
                    <t t-name="web.Child" t-inherit="web.Parent">
                        <xpath expr="//div[contains(@t-if, 'state.value')]" position="after">
                            <span/>
                        </xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        attr_changes = [{
            'template_name': 'web.Parent',
            'attr_name': 't-if',
            'old_value': 'state.value',
            'new_value': 'this.state.value',
        }]

        files_modified, changes_count, messages = update_inheriting_xpaths(
            index, attr_changes, dry_run=False
        )

        self.assertEqual(files_modified, 0)
        self.assertTrue(any('WARNING' in m for m in messages))

    def test_duplicate_attr_changes_deduplicated(self):
        """Duplicate attr_changes don't cause double updates."""
        self._write_file(
            'web/comp.xml',
            textwrap.dedent("""\
                <templates>
                    <t t-name="web.Child" t-inherit="web.Parent">
                        <xpath expr="//div[@t-if='val']" position="after"><span/></xpath>
                    </t>
                </templates>"""),
        )

        index = build_inheritance_index([self.tmpdir])
        # Same change reported twice (can happen with multiple properties)
        attr_changes = [
            {
                'template_name': 'web.Parent',
                'attr_name': 't-if',
                'old_value': 'val',
                'new_value': 'this.val',
            },
            {
                'template_name': 'web.Parent',
                'attr_name': 't-if',
                'old_value': 'val',
                'new_value': 'this.val',
            },
        ]

        files_modified, changes_count, messages = update_inheriting_xpaths(
            index, attr_changes, dry_run=False
        )

        result = self._read_file('web/comp.xml')
        self.assertEqual(changes_count, 1)
        self.assertIn("@t-if='this.val'", result)
        # Ensure not double-prefixed
        self.assertNotIn("this.this.", result)


class TestEndToEndXpathCascade(unittest.TestCase):
    """End-to-end test: base template change cascades to inheriting XPaths."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def _write_file(self, rel_path, content):
        full_path = os.path.join(self.tmpdir, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)
        return full_path

    def _read_file(self, rel_path):
        with open(os.path.join(self.tmpdir, rel_path)) as f:
            return f.read()

    def test_cog_menu_cascade(self):
        """Real-world scenario: CogMenu base template change cascades to inheritors."""
        # Base template
        self._write_file(
            'addons/web/static/src/search/cog_menu/cog_menu.xml',
            textwrap.dedent("""\
                <?xml version="1.0" encoding="UTF-8"?>
                <templates xml:space="preserve">
                    <t t-name="web.CogMenu">
                        <div t-if="hasItems" class="o_cp_action_menus">
                            <t t-if="state.printItems.length">
                                <Dropdown/>
                            </t>
                        </div>
                    </t>
                </templates>"""),
        )

        # Inheriting templates
        for name, tpl_name in [('list', 'ListCogMenu'), ('kanban', 'KanbanCogMenu')]:
            self._write_file(
                f'addons/web/static/src/views/{name}/{name}_cog_menu.xml',
                textwrap.dedent(f"""\
                    <?xml version="1.0" encoding="UTF-8"?>
                    <templates xml:space="preserve">
                        <t t-name="web.{tpl_name}" t-inherit="web.CogMenu">
                            <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                                <div role="separator" class="dropdown-divider"/>
                            </xpath>
                        </t>
                    </templates>"""),
            )

        # Form inheritor with multiple xpaths
        self._write_file(
            'addons/web/static/src/views/form/form_cog_menu.xml',
            textwrap.dedent("""\
                <?xml version="1.0" encoding="UTF-8"?>
                <templates xml:space="preserve">
                    <t t-name="web.FormCogMenu" t-inherit="web.CogMenu">
                        <xpath expr="//div[hasclass('o_cp_action_menus')]" position="attributes">
                            <attribute name="t-if">env.isSmall or hasItems</attribute>
                        </xpath>
                        <xpath expr="//t[@t-if='state.printItems.length']/Dropdown" position="before">
                            <div role="separator" class="dropdown-divider"/>
                        </xpath>
                    </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/search/cog_menu/cog_menu.xml",
                    "templateName": "web.CogMenu",
                    "property": "state",
                    "xpath": "./div/t/@t-if",
                    "expression": "state.printItems.length",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path,
            addons_dirs=[os.path.join(self.tmpdir, 'addons')],
        )

        # Base template should be updated
        base = self._read_file('addons/web/static/src/search/cog_menu/cog_menu.xml')
        self.assertIn('this.state.printItems.length', base)

        # All inheriting templates should have their XPaths updated
        for name in ['list', 'kanban']:
            result = self._read_file(
                f'addons/web/static/src/views/{name}/{name}_cog_menu.xml'
            )
            self.assertIn(
                "@t-if='this.state.printItems.length'", result,
                f"{name} cog menu XPath was not updated"
            )

        form = self._read_file('addons/web/static/src/views/form/form_cog_menu.xml')
        self.assertIn("@t-if='this.state.printItems.length'", form)
        # The hasclass xpath should be untouched
        self.assertIn("hasclass('o_cp_action_menus')", form)

    def test_no_cascade_when_no_inheritors(self):
        """When no templates inherit from the changed one, no cascade happens."""
        self._write_file(
            'addons/web/static/src/comp.xml',
            textwrap.dedent("""\
                <?xml version="1.0"?>
                <templates>
                <t t-name="web.Standalone">
                    <div t-esc="state.value"/>
                </t>
                </templates>"""),
        )

        json_data = {
            "accesses": {
                "key1": {
                    "filename": "/web/static/src/comp.xml",
                    "templateName": "web.Standalone",
                    "property": "state",
                    "xpath": "./div/@t-esc",
                    "expression": "state.value",
                    "source": "component",
                },
            },
            "getterAccesses": {},
        }
        json_path = os.path.join(self.tmpdir, 'templatesInfos.json')
        with open(json_path, 'w') as f:
            json.dump(json_data, f)

        files_modified, total_changes, messages = run_codemod(
            self.tmpdir, dry_run=False, json_path=json_path,
            addons_dirs=[os.path.join(self.tmpdir, 'addons')],
        )

        # Only the base template should be modified
        self.assertEqual(files_modified, 1)
        base = self._read_file('addons/web/static/src/comp.xml')
        self.assertIn('this.state.value', base)


if __name__ == '__main__':
    unittest.main()
