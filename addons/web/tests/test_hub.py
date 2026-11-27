from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, new_test_user, tagged


@tagged('post_install', '-at_install')
class TestHub(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(cls.env, 'hub_user', groups='base.group_user')
        cls.partner = cls.env['res.partner'].create({'name': 'Hub partner'})
        cls.action = cls.env['ir.actions.act_window'].create({'name': 'Partners', 'res_model': 'res.partner'})
        cls.env['ir.ui.view'].search([('model', '=', 'res.partner'), ('type', '=', 'hub')]).unlink()
        cls.hub_view = cls.env['ir.ui.view'].create({
            'model': 'res.partner',
            'priority': 10,
            'arch': f'''
                <hub>
                    <button name="action_archive" type="object" string="Method"/>
                    <button name="{cls.action.id}" type="action" string="Action"/>
                    <button name="action_unarchive" type="object" string="Administrators" groups="base.group_system"/>
                    <button name="action_archive" type="object" string="Companies" invisible="not is_company"
                            context="{{'default_parent_id': id, 'partner_name': name}}"/>
                </hub>
            ''',
        })

    def _get_item_strings(self, view_id=False):
        hub = self.partner.with_user(self.user).web_get_hub(view_id)
        return [item['string'] for item in hub['items']]

    # the buttons of the hub are filtered by groups and by their invisible
    # expression, and their context is evaluated, on the record
    def test_items(self):
        hub = self.partner.with_user(self.user).web_get_hub()
        self.assertEqual(hub['view_id'], self.hub_view.id)
        self.assertEqual(hub['display_name'], 'Hub partner')
        self.assertEqual(hub['items'], [
            {'key': 'object:action_archive', 'type': 'object', 'name': 'action_archive', 'string': 'Method', 'context': {}},
            {'key': f'action:{self.action.id}', 'type': 'action', 'name': str(self.action.id), 'string': 'Action', 'context': {}},
        ])
        self.assertEqual(
            [item['string'] for item in self.partner.web_get_hub()['items']],
            ['Method', 'Action', 'Administrators'],
        )
        self.partner.is_company = True
        hub = self.partner.with_user(self.user).web_get_hub()
        self.assertEqual(hub['items'][-1]['context'], {'default_parent_id': self.partner.id, 'partner_name': 'Hub partner'})

    # the default hub view is the primary one with the lowest priority, unless
    # another one is given
    def test_view(self):
        other_view = self.env['ir.ui.view'].create({
            'model': 'res.partner',
            'priority': 20,
            'arch': '<hub><button name="action_unarchive" type="object" string="Other"/></hub>',
        })
        self.env['ir.ui.view'].create({
            'model': 'res.partner',
            'inherit_id': self.hub_view.id,
            'arch': '''
                <xpath expr="//button[@type='action']" position="before">
                    <button name="action_unarchive" type="object" string="Inherited"/>
                </xpath>
            ''',
        })
        self.assertEqual(self._get_item_strings(), ['Method', 'Inherited', 'Action'])
        self.assertEqual(self._get_item_strings(other_view.id), ['Other'])
        self.assertIn('res.partner', self.env['ir.ui.view']._get_hub_models())

    # a model without hub view has no hub
    def test_no_hub(self):
        self.assertFalse(self.env.company.web_get_hub())

    # a hub view only contains buttons opening an action or calling a method
    def test_validation(self):
        for arch in [
            '<hub><field name="name"/></hub>',
            '<hub><button name="action_archive" type="object"/></hub>',
            '<hub><button string="No type" name="action_archive"/></hub>',
            '<hub><button string="Unknown" name="action_unknown" type="object"/></hub>',
        ]:
            with self.subTest(arch=arch), self.assertRaises(ValidationError):
                self.env['ir.ui.view'].create({'model': 'res.partner', 'arch': arch})

    # the user's setting of a record is created, updated, and formatted
    def test_set_hub_setting(self):
        settings = self.env['res.users.settings']._find_or_create_for_user(self.user).with_user(self.user)
        settings.set_hub_setting('res.partner', self.partner.id, {'pinned_item_keys': ['object:action_archive'], 'unknown': True})
        settings.set_hub_setting('res.partner', self.partner.id, {'show_tabs': True})
        self.assertEqual(len(settings.hub_config_ids), 1, "the setting of the record is updated")
        self.assertEqual(
            settings._res_users_settings_format(['hub_config_ids'])['hub_config_ids'],
            {f'res.partner,{self.partner.id}': {'pinned_item_keys': ['object:action_archive'], 'show_tabs': True}},
        )
