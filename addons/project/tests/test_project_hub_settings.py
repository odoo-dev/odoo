from odoo.addons.project.tests.test_project_base import TestProjectCommon


class TestProjectHubSettings(TestProjectCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pinned_item_keys = ['object:action_view_tasks', 'object:action_open_project_form']
        cls.user_settings_project_manager = cls.env['res.users.settings']._find_or_create_for_user(cls.user_projectmanager)
        cls.user_settings_project_user = cls.env['res.users.settings']._find_or_create_for_user(cls.user_projectuser)
        cls.project_pigs.user_id = cls.user_projectmanager
        cls.hub_setting = cls.env['res.users.settings.hub'].create({
            'user_setting_id': cls.user_settings_project_manager.id,
            'res_model': 'project.project',
            'res_id': cls.project_pigs.id,
            'pinned_item_keys': cls.pinned_item_keys,
            'show_tabs': True,
        })

    def test_copy_hub_settings(self):
        copied_project = self.project_pigs.copy()
        copied_setting = self.user_settings_project_manager.hub_config_ids.filtered(
            lambda setting: setting.res_id == copied_project.id
        )
        self.assertEqual(len(copied_setting), 1)
        self.assertEqual(copied_setting.res_model, 'project.project')
        self.assertEqual(copied_setting.pinned_item_keys, self.pinned_item_keys)
        self.assertTrue(copied_setting.show_tabs)

    def test_unlink_project_removes_hub_settings(self):
        self.project_pigs.unlink()
        self.assertFalse(self.hub_setting.exists())

    def test_default_hub_setting_from_project_manager(self):
        default_setting = self.user_settings_project_user.with_user(self.user_projectuser).get_default_hub_setting(
            'project.project', self.project_pigs.id,
        )
        self.assertEqual(default_setting, {'pinned_item_keys': self.pinned_item_keys})
        # the project manager starts from no setting
        default_setting = self.user_settings_project_manager.with_user(self.user_projectmanager).get_default_hub_setting(
            'project.project', self.project_pigs.id,
        )
        self.assertEqual(default_setting, {})
