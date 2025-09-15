# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import TransactionCase


class TestViews(TransactionCase):

    def setUp(self):
        super().setUp()
        Qweb = self.env['ir.qweb']
        self.first_view = Qweb.create({
            'name': 'Test Qweb 1',
            'arch': '<div>Hello World</div>',
            'key': 'html_editor.test_first_view',
        })
        self.second_view = Qweb.create({
            'name': 'Test Qweb 2',
            'arch': '<div><t t-call="html_editor.test_first_view"/></div>',
            'key': 'html_editor.test_second_view',
        })

    def test_infinite_inherit_loop(self):
        # Creates an infinite loop: A t-call B and A inherit from B
        Qweb = self.env['ir.qweb']

        self.second_view.write({
            'inherit_id': self.first_view.id,
        })
        # Test for RecursionError: maximum recursion depth exceeded in this function
        Qweb._views_get(self.first_view)

    def test_oe_structure_as_inherited_view(self):
        Qweb = self.env['ir.qweb']

        base = Qweb.create({
            'name': 'Test Qweb oe_structure',
            'arch': """<xpath expr='//t[@t-call="html_editor.test_first_view"]' position='after'>
                        <div class="oe_structure" id='oe_structure_test_view_oe_structure'/>
                    </xpath>""",
            'key': 'html_editor.oe_structure_view',
            'inherit_id': self.second_view.id
        })

        # check view mode
        self.assertEqual(base.mode, 'extension')

        # update content of the oe_structure
        value = '''<div class="oe_structure" id="oe_structure_test_view_oe_structure" data-oe-id="%s"
                         data-oe-xpath="/div" data-oe-model="ir.qweb" data-oe-field="arch">
                        <p>Hello World!</p>
                   </div>''' % base.id

        base.save(value=value, xpath='/xpath/div')

        self.assertEqual(len(base.inherit_children_ids), 1)
        self.assertEqual(base.inherit_children_ids.mode, 'extension')
        self.assertIn(
            '<p>Hello World!</p>',
            base.inherit_children_ids.get_combined_arch(),
        )

    def test_find_available_name(self):
        Qweb = self.env['ir.qweb']
        used_names = ['Unrelated name']
        initial_name = "Test name"
        name = Qweb._find_available_name(initial_name, used_names)
        self.assertEqual(initial_name, name)
        used_names.append(name)
        name = Qweb._find_available_name(initial_name, used_names)
        self.assertEqual('Test name (2)', name)
        used_names.append(name)
        name = Qweb._find_available_name(initial_name, used_names)
        self.assertEqual('Test name (3)', name)
