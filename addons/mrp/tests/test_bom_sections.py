# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import Command
from odoo.tests import Form
from odoo.tools import mute_logger

from odoo.addons.mrp.tests.common import TestMrpCommon


class TestBomSections(TestMrpCommon):
    """ Sections of the components of a bill of materials (as on sales orders):
    they only group the components, they are not produced. """

    def test_bom_sections(self):
        bom = self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'bom_line_ids': [
                Command.create({'display_type': 'line_section', 'name': 'Frame', 'sequence': 1}),
                Command.create({'product_id': self.product_2.id, 'product_qty': 2.0, 'sequence': 2}),
                Command.create({'display_type': 'line_section', 'name': 'Finishing', 'sequence': 3}),
                Command.create({'product_id': self.product_1.id, 'product_qty': 1.0, 'sequence': 4}),
            ],
        })
        sections = bom.bom_line_ids.filtered('display_type')
        self.assertEqual(sections.mapped('name'), ['Frame', 'Finishing'])
        self.assertEqual(bom.component_count, 2)
        _boms, lines = bom.explode(self.product_4, 1.0)
        self.assertEqual([line.product_id for line, _data in lines], [self.product_2, self.product_1])
        exploded_line_ids, _count = bom._get_exploded_bom_data()
        self.assertEqual(self.env['mrp.bom.line'].browse(exploded_line_ids).product_id, self.product_2 | self.product_1)

        # the manufacturing order consumes the components only
        production_form = Form(self.env['mrp.production'].with_user(self.env.ref('base.user_admin')))
        production_form.product_id = self.product_4
        production_form.bom_id = bom
        production = production_form.save()
        production.action_confirm()
        self.assertEqual(production.move_raw_ids.product_id, self.product_2 | self.product_1)
        self.assertNotIn(sections, production.move_raw_ids.bom_line_id)

        # a copy keeps the sections
        self.assertEqual(bom.copy().bom_line_ids.filtered('display_type').mapped('name'), ['Frame', 'Finishing'])

        # added from the form
        bom_form = Form(bom.with_user(self.env.ref('base.user_admin')))
        with bom_form.bom_line_ids.new() as section:
            section.display_type = 'line_section'
            section.name = 'Packaging'
            section.sequence = 5
        bom_form.save()
        self.assertEqual(bom.bom_line_ids.filtered('display_type').mapped('name'), ['Frame', 'Finishing', 'Packaging'])
        self.assertEqual(bom.component_count, 2)

    @mute_logger('odoo.sql_db')
    def test_component_required_except_on_section(self):
        bom = self.env['mrp.bom'].sudo().create({'product_tmpl_id': self.product_4.product_tmpl_id.id})
        with self.assertRaises(Exception):
            with self.cr.savepoint():
                self.env['mrp.bom.line'].sudo().create({'bom_id': bom.id, 'product_qty': 1.0})

    def _create_bom_with_sections(self):
        return self.env['mrp.bom'].sudo().create({
            'product_tmpl_id': self.product_4.product_tmpl_id.id,
            'product_qty': 1.0,
            'bom_line_ids': [
                Command.create({'display_type': 'line_section', 'name': 'Frame', 'sequence': 1}),
                Command.create({'product_id': self.product_2.id, 'product_qty': 2.0, 'sequence': 2}),
                Command.create({'display_type': 'line_section', 'name': 'Finishing', 'sequence': 3}),
                Command.create({'product_id': self.product_1.id, 'product_qty': 1.0, 'sequence': 4}),
            ],
        })

    def test_bom_section_quantity(self):
        """ Changing the quantity of a section scales its components only. """
        bom = self._create_bom_with_sections()
        frame_line = bom.bom_line_ids.filtered(lambda line: line.product_id == self.product_2)
        finishing_line = bom.bom_line_ids.filtered(lambda line: line.product_id == self.product_1)
        self.assertEqual(frame_line.section_line_id.name, 'Frame')
        self.assertEqual(finishing_line.section_line_id.name, 'Finishing')

        bom_form = Form(bom.with_user(self.env.ref('base.user_admin')))
        with bom_form.bom_line_ids.edit(0) as section:
            section.product_qty = 3.0
        with bom_form.bom_line_ids.edit(0) as section:
            section.name = 'Big Frame'
        bom_form.save()
        self.assertEqual(frame_line.product_qty, 6.0)
        self.assertEqual(finishing_line.product_qty, 1.0)
        self.assertEqual(frame_line.section_line_id.name, 'Big Frame')

        # back to 1
        bom_form = Form(bom.with_user(self.env.ref('base.user_admin')))
        with bom_form.bom_line_ids.edit(0) as section:
            section.product_qty = 1.0
        bom_form.save()
        self.assertEqual(frame_line.product_qty, 2.0)

    def test_production_sections(self):
        """ The sections of the BoM are on its manufacturing orders, where their
        quantity scales their components too. """
        bom = self._create_bom_with_sections()
        production_form = Form(self.env['mrp.production'].with_user(self.env.ref('base.user_admin')))
        production_form.product_id = self.product_4
        production_form.bom_id = bom
        production_form.product_qty = 2.0
        production = production_form.save()
        self.assertEqual(production.production_section_ids.mapped('name'), ['Frame', 'Finishing'])
        frame, finishing = production.production_section_ids
        frame_move = production.move_raw_ids.filtered(lambda move: move.product_id == self.product_2)
        finishing_move = production.move_raw_ids.filtered(lambda move: move.product_id == self.product_1)
        self.assertEqual(frame_move.production_section_key, frame.key)
        self.assertEqual(finishing_move.production_section_key, finishing.key)
        self.assertEqual(frame.bom_section_line_id.name, 'Frame')
        self.assertEqual((frame_move.product_uom_qty, finishing_move.product_uom_qty), (4.0, 2.0))

        # the quantity of the section scales its components
        frame.product_qty = 1.5
        production._onchange_production_section_quantity()
        self.assertEqual((frame_move.product_uom_qty, finishing_move.product_uom_qty), (6.0, 2.0))
        self.assertEqual(frame.applied_product_qty, 1.5)

        # still at the quantity of the section when the quantity to produce changes
        production_form = Form(production.with_user(self.env.ref('base.user_admin')))
        production_form.product_qty = 4.0
        production = production_form.save()
        self.assertEqual((frame_move.product_uom_qty, finishing_move.product_uom_qty), (12.0, 4.0))

        # confirmed: the components are still scaled
        production.action_confirm()
        finishing.product_qty = 2.0
        production._onchange_production_section_quantity()
        self.assertEqual(finishing_move.product_uom_qty, 8.0)

        # on the BoM, the sections of the orders are not changed
        self.assertEqual(bom.bom_line_ids.filtered('display_type').mapped('product_qty'), [1.0, 1.0])

    def test_saved_section(self):
        """ A saved section is added with its components (quantities for one unit of
        finished product) to bills of materials and manufacturing orders. """
        template = self.env['mrp.section.template'].create({
            'name': 'Packaging',
            'product_qty': 1.0,
            'line_ids': [
                Command.create({'product_id': self.product_2.id, 'product_qty': 2.0, 'uom_id': self.product_2.uom_id.id}),
                Command.create({'product_id': self.product_1.id, 'product_qty': 0.5, 'uom_id': self.product_1.uom_id.id}),
            ],
        })
        bom = self._create_bom_with_sections()
        bom.product_qty = 2.0
        template.with_user(self.env.ref('base.user_admin')).add_to_document('mrp.bom', bom.id)
        lines = bom.bom_line_ids.sorted('sequence')
        self.assertEqual(lines.filtered('display_type').mapped('name'), ['Frame', 'Finishing', 'Packaging'])
        packaging = lines.filtered(lambda line: line.name == 'Packaging')
        packaging_lines = lines.filtered(lambda line: line.sequence > packaging.sequence)
        self.assertEqual(packaging_lines.product_id, self.product_2 | self.product_1)
        self.assertEqual(packaging_lines.mapped('product_qty'), [4.0, 1.0])
        self.assertEqual(packaging_lines.section_line_id, packaging)

        # on a confirmed manufacturing order
        production_form = Form(self.env['mrp.production'].with_user(self.env.ref('base.user_admin')))
        production_form.product_id = self.product_4
        production_form.bom_id = self._create_bom_with_sections()
        production_form.product_qty = 3.0
        production = production_form.save()
        production.action_confirm()
        template.with_user(self.env.ref('base.user_admin')).add_to_document('mrp.production', production.id)
        section = production.production_section_ids.filtered(lambda section: section.name == 'Packaging')
        self.assertTrue(section.key)
        self.assertFalse(section.bom_section_line_id)
        moves = production.move_raw_ids.filtered(lambda move: move.production_section_key == section.key)
        self.assertEqual(moves.product_id, self.product_2 | self.product_1)
        self.assertEqual(sorted(moves.mapped('product_uom_qty')), [1.5, 6.0])
        self.assertTrue(all(move.state != 'draft' for move in moves))

        # its quantity scales its components too
        section.product_qty = 2.0
        production._onchange_production_section_quantity()
        self.assertEqual(sorted(moves.mapped('product_uom_qty')), [3.0, 12.0])
