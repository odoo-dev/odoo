
from odoo import models
from odoo.exceptions import MissingError, UserError
from odoo.fields import Command
from odoo.tests import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged('at_install', '-post_install')
class TestUnlink(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Container = cls.env['test_orm.unlink']
        cls.Null = cls.env['test_orm.unlink.null']
        cls.Cascade = cls.env['test_orm.unlink.cascade']

        cls.container = cls.Container.create({})

    @mute_logger("odoo.models.unlink")
    def test_unlink_set_null_modified(self):
        null_line = self.Null.create({'container_id': self.container.id})
        self.assertEqual(null_line.has_container, True)

        self.container.unlink()
        self.assertEqual(null_line.has_container, False)

    @mute_logger("odoo.models.unlink")
    def test_unlink_cascade_modified(self):
        cascade = self.Cascade.create({'container_id': self.container.id})
        child = self.Cascade.create({'parent_id': cascade.id})
        self.assertEqual(child.has_parent, True)

        self.container.unlink()

        self.assertFalse(cascade.exists())
        self.assertEqual(child.has_parent, False)
        with self.assertRaises(MissingError):
            cascade.container_id

    @mute_logger("odoo.models.unlink")
    def test_unlink_parent_path(self):
        cascade = self.Cascade.create({'container_id': self.container.id})
        child = self.Cascade.create({'parent_id': cascade.id})

        self.assertEqual(cascade.parent_path, f'{cascade.id}/')
        self.assertEqual(child.parent_path, f'{cascade.id}/{child.id}/')

        self.container.unlink()

        self.assertEqual(child.parent_path, f'{child.id}/')

    @mute_logger("odoo.models.unlink")
    def test_unlink_cascade_model_data(self):
        ModelData = self.env['ir.model.data']

        cascade = self.Cascade.create({'container_id': self.container.id})
        ref_name = 'test_orm.test_unlink_cascade_model_data'
        ModelData.create({
            'module': 'test_orm',
            'name': 'test_unlink_cascade_model_data',
            'model': cascade._name,
            'res_id': cascade.id,
        })

        self.assertEqual(ModelData._xmlid_to_res_id(ref_name), cascade.id)

        self.container.unlink()

        self.assertFalse(ModelData._xmlid_to_res_id(ref_name, raise_if_not_found=False))

    @mute_logger("odoo.models.unlink")
    def test_unlink_inverse_inside(self):
        # See https://github.com/odoo/odoo/pull/229604
        containers = self.Container.create([
            {'cascade_ids': [Command.create({})]},
            {'cascade_ids': [Command.create({})]},
        ])

        self.assertEqual(len(containers[0].cascade_ids), 1)
        self.assertEqual(len(containers[1].cascade_ids), 1)

        containers.user_command = 'remove lines'

        self.assertEqual(len(containers[0].cascade_ids), 0)
        self.assertEqual(len(containers[1].cascade_ids), 0)

    @mute_logger("odoo.models.unlink")
    def test_unlink_graph_1(self):
        # container <== cascade1 <---- cascade2
        #        ^                        ║
        #        ╚========================╝
        cascade1 = self.Cascade.create({
            'container_id': self.container.id,
        })
        cascade2 = self.Cascade.create({
            'container_id': self.container.id,
            'parent_id': cascade1.id,
        })
        self.assertEqual(cascade2.has_parent, True)

        self.container.unlink()

        self.assertFalse(self.container.exists())
        self.assertFalse(cascade1.exists())
        self.assertFalse(cascade2.exists())

        with self.assertRaises(MissingError):
            cascade2.parent_id

    @mute_logger("odoo.models.unlink")
    def test_unlink_graph_2(self):
        #        ╔========== cascade1
        #        v
        # container <======= cascade2
        #     ^  ^              ┃
        #     |  |              v    <override _delete_extra>
        #     |  └---------- null1
        #     |
        #     └------------- null2
        cascade1, cascade2 = self.Cascade.create([
            {'container_id': self.container.id},
            {'container_id': self.container.id},
        ])
        null1, null2 = self.Null.create([
            {'container_id': self.container.id},
            {'container_id': self.container.id},
        ])
        cascade1.null_id = null1  # null1 should be deleted, too

        self.container.unlink()
        self.assertFalse(self.container.exists())
        self.assertFalse(cascade1.exists())
        self.assertFalse(cascade2.exists())
        self.assertFalse(null1.exists())

        with self.assertRaises(MissingError):
            null1.container_id

        self.assertTrue(null2.exists())
        self.assertFalse(null2.container_id)

    @mute_logger("odoo.models.unlink")
    def test_unlink_many2many(self):
        cascade1, cascade2 = self.Cascade.create([
            {'container_id': self.container.id},
            {},
        ])
        null = self.Null.create({
            'cascade_ids': [Command.link(cascade1.id), Command.link(cascade2.id)],
        })
        self.assertEqual(null.cascade_ids, cascade1 + cascade2)
        self.assertEqual(null.cascade_count, 2)

        self.container.unlink()

        self.assertFalse(cascade1.exists())
        self.assertTrue(cascade2.exists())
        self.assertEqual(null.cascade_ids, cascade2)
        self.assertEqual(null.cascade_count, 1)

    @mute_logger("odoo.models.unlink")
    def test_unlink_performance(self):
        containers = self.Container.create([
            {
                'cascade_ids': [Command.create({}), Command.create({})],
                'null_ids': [Command.create({}), Command.create({})],
            }
            for __ in range(50)
        ])
        self.env.flush_all()

        # 3 +3 queries : search ir.model.data / ir.attachment / ir.default for unlink + cascade_ids
        # 1 query to nullify test_orm.unlink.cascade.parent_id
        # 1 query to drop deleted records from test_orm.unlink.null.cascade_ids
        # 1 Query for delete
        # 1 query to update test_orm.unlink.null.has_container
        with self.assertQueryCount(10):
            containers.unlink()


@tagged('at_install', '-post_install')
class TestUnlinkRef(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.RefModel = cls.env['test_orm.unlink.ref']
        cls.protected = cls.env.ref('test_base.unlink_ref_protected')
        cls.custom = cls.env.ref('test_base.unlink_ref_custom')

    def test_declaration(self):
        ref = self.registry['test_orm.unlink.ref']._ref_protected
        self.assertIsInstance(ref, models.Ref)
        self.assertEqual(ref.name, '_ref_protected')
        self.assertEqual(ref._module, 'test_base')
        self.assertIs(self.RefModel._refs['_ref_protected'], ref)
        # only protecting references
        self.assertEqual(
            self.registry.refs_targeting['test_orm.unlink.ref'],
            (ref, self.RefModel._refs['_ref_custom']),
        )

    def test_access(self):
        record = self.RefModel.create({})
        self.assertEqual(record._ref_protected, self.protected)
        self.assertEqual(self.RefModel._ref_protected, self.protected)
        # browsed in the environment of the recordset
        user = self.env['res.users'].search([('id', '!=', self.env.uid)], limit=1)
        self.assertEqual(record.with_user(user)._ref_protected.env.uid, user.id)
        with self.assertQueryCount(0):
            record._ref_protected

    def test_access_optional(self):
        record = self.RefModel._ref_optional
        self.assertEqual(record, self.RefModel)
        self.assertFalse(record.id)

    def test_access_missing(self):
        ref = models.Ref('test_base.unlink_ref_missing', 'test_orm.unlink.ref')
        with self.assertRaisesRegex(UserError, r"test_base\.unlink_ref_missing.*Update the module test_base"):
            ref.__get__(self.RefModel)

    def test_access_wrong_model(self):
        ref = models.Ref('test_base.unlink_ref_protected', 'test_orm.unlink')
        with self.assertRaisesRegex(TypeError, r"references a record of model 'test_orm.unlink.ref'"):
            ref.__get__(self.RefModel)

    def test_unlink_protected(self):
        with self.assertRaisesRegex(UserError, r"You cannot delete Protected: the module test_base requires it\. Archive it instead\."):
            self.protected.unlink()
        with self.assertRaisesRegex(UserError, r"^Custom is precious\.$"):
            (self.RefModel.create({'name': 'Other'}) + self.custom).unlink()
        self.assertTrue(self.protected.exists())
        self.assertTrue(self.custom.exists())

    @mute_logger('odoo.models.unlink')
    def test_unlink_unprotected(self):
        other = self.RefModel.create({'name': 'Other'})
        other.unlink()
        self.assertFalse(other.exists())

        # an optional reference does not protect its record
        unprotected = self.env.ref('test_base.unlink_ref_unprotected')
        self.assertEqual(self.RefModel._ref_unprotected, unprotected)
        unprotected.unlink()
        self.assertFalse(unprotected.exists())
        self.assertEqual(self.RefModel._ref_unprotected, self.RefModel)

    def test_unlink_cascade(self):
        parent = self.RefModel.create({'name': 'Parent'})
        self.protected.parent_id = parent
        with self.assertRaisesRegex(UserError, r"^Deleting Parent would also delete Protected, which the module test_base requires\. Archive it instead\.$"):
            parent.unlink()
        self.assertTrue(parent.exists())

    @mute_logger('odoo.models.unlink')
    def test_unlink_force_delete(self):
        with self.assertLogs('odoo.models', 'WARNING') as capture:
            self.protected.with_context(force_delete=True).unlink()
        self.assertFalse(self.protected.exists())
        self.assertIn("required by module test_base", capture.output[0])

    @mute_logger('odoo.models.unlink')
    def test_unlink_uninstalling(self):
        self.patch(self.registry, 'uninstalling_modules', {'test_base'})
        self.protected.unlink()
        self.assertFalse(self.protected.exists())

    def test_xmlid_protected(self):
        data = self.env['ir.model.data'].search([('module', '=', 'test_base'), ('name', '=', 'unlink_ref_protected')])
        self.assertTrue(data)
        with self.assertRaisesRegex(UserError, r"You cannot delete the External ID test_base\.unlink_ref_protected: the module test_base requires it\."):
            data.unlink()
        with self.assertRaisesRegex(UserError, r"You cannot modify the External ID test_base\.unlink_ref_protected"):
            data.name = 'renamed'
        with self.assertRaisesRegex(UserError, r"You cannot modify the External ID test_base\.unlink_ref_protected"):
            data.res_id = self.custom.id
        # the custom message is about the record, not its XML ID
        data_custom = self.env['ir.model.data'].search([('module', '=', 'test_base'), ('name', '=', 'unlink_ref_custom')])
        with self.assertRaisesRegex(UserError, r"You cannot delete the External ID test_base\.unlink_ref_custom"):
            data_custom.unlink()
        # writing the same values or other fields is fine
        data.write({'name': 'unlink_ref_protected', 'noupdate': True})
