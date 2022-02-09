# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.base.models.res_users import is_selection_groups, get_selection_groups
from odoo.tests.common import TransactionCase, Form, tagged


class TestUsers(TransactionCase):

    def test_name_search(self):
        """ Check name_search on user. """
        User = self.env['res.users']

        test_user = User.create({'name': 'Flad the Impaler', 'login': 'vlad'})
        like_user = User.create({'name': 'Wlad the Impaler', 'login': 'vladi'})
        other_user = User.create({'name': 'Nothing similar', 'login': 'nothing similar'})
        all_users = test_user | like_user | other_user

        res = User.name_search('vlad', operator='ilike')
        self.assertEqual(User.browse(i[0] for i in res) & all_users, test_user)

        res = User.name_search('vlad', operator='not ilike')
        self.assertEqual(User.browse(i[0] for i in res) & all_users, all_users)

        res = User.name_search('', operator='ilike')
        self.assertEqual(User.browse(i[0] for i in res) & all_users, all_users)

        res = User.name_search('', operator='not ilike')
        self.assertEqual(User.browse(i[0] for i in res) & all_users, User)

        res = User.name_search('lad', operator='ilike')
        self.assertEqual(User.browse(i[0] for i in res) & all_users, test_user | like_user)

        res = User.name_search('lad', operator='not ilike')
        self.assertEqual(User.browse(i[0] for i in res) & all_users, other_user)

    def test_user_partner(self):
        """ Check that the user partner is well created """

        User = self.env['res.users']
        Partner = self.env['res.partner']
        Company = self.env['res.company']

        company_1 = Company.create({'name': 'company_1'})
        company_2 = Company.create({'name': 'company_2'})

        partner = Partner.create({
            'name': 'Bob Partner',
            'company_id': company_2.id
        })

        # case 1 : the user has no partner
        test_user = User.create({
            'name': 'John Smith',
            'login': 'jsmith',
            'company_ids': [company_1.id],
            'company_id': company_1.id
        })

        self.assertFalse(
            test_user.partner_id.company_id,
            "The partner_id linked to a user should be created without any company_id")

        # case 2 : the user has a partner
        test_user = User.create({
            'name': 'Bob Smith',
            'login': 'bsmith',
            'company_ids': [company_1.id],
            'company_id': company_1.id,
            'partner_id': partner.id
        })

        self.assertEqual(
            test_user.partner_id.company_id,
            company_1,
            "If the partner_id of a user has already a company, it is replaced by the user company"
        )


    def test_change_user_company(self):
        """ Check the partner company update when the user company is changed """

        User = self.env['res.users']
        Company = self.env['res.company']

        test_user = User.create({'name': 'John Smith', 'login': 'jsmith'})
        company_1 = Company.create({'name': 'company_1'})
        company_2 = Company.create({'name': 'company_2'})

        test_user.company_ids += company_1
        test_user.company_ids += company_2

        # 1: the partner has no company_id, no modification
        test_user.write({
            'company_id': company_1.id
        })

        self.assertFalse(
            test_user.partner_id.company_id,
            "On user company change, if its partner_id has no company_id,"
            "the company_id of the partner_id shall NOT be updated")

        # 2: the partner has a company_id different from the new one, update it
        test_user.partner_id.write({
            'company_id': company_1.id
        })

        test_user.write({
            'company_id': company_2.id
        })

        self.assertEqual(
            test_user.partner_id.company_id,
            company_2,
            "On user company change, if its partner_id has already a company_id,"
            "the company_id of the partner_id shall be updated"
        )

@tagged('post_install', '-at_install')
class TestUsers2(TransactionCase):
    def test_reified_groups(self):
        """ The groups handler doesn't use the "real" view with pseudo-fields
        during installation, so it always works (because it uses the normal
        groups_id field).
        """
        # use the specific views which has the pseudo-fields
        f = Form(self.env['res.users'], view='base.view_users_form')
        f.name = "bob"
        f.login = "bob"
        user = f.save()

        self.assertIn(self.env.ref('base.group_user'), user.groups_id)

    def test_selection_groups(self):
        # create 3 groups that should be in a selection
        app = self.env['ir.module.category'].create({'name': 'Foo'})
        group1, group2, group0 = self.env['res.groups'].create([
            {'name': name, 'category_id': app.id}
            for name in ('User', 'Manager', 'Visitor')
        ])
        # THIS PART IS NECESSARY TO REPRODUCE AN ISSUE: group1.id < group2.id < group0.id
        self.assertLess(group1.id, group2.id)
        self.assertLess(group2.id, group0.id)
        # implication order is group0 < group1 < group2
        group2.implied_ids = group1
        group1.implied_ids = group0
        groups = group0 + group1 + group2

        # determine the name of the field corresponding to groups
        fname = next(
            name
            for name in self.env['res.users'].fields_get()
            if is_selection_groups(name) and group0.id in get_selection_groups(name)
        )
        self.assertCountEqual(get_selection_groups(fname), groups.ids)

        # create a user
        user = self.env['res.users'].create({'name': 'foo', 'login': 'foo'})

        # put user in group0, and check field value
        user.write({fname: group0.id})
        self.assertEqual(user.groups_id & groups, group0)
        self.assertEqual(user.read([fname])[0][fname], group0.id)

        # put user in group1, and check field value
        user.write({fname: group1.id})
        self.assertEqual(user.groups_id & groups, group0 + group1)
        self.assertEqual(user.read([fname])[0][fname], group1.id)

        # put user in group2, and check field value
        user.write({fname: group2.id})
        self.assertEqual(user.groups_id & groups, groups)
        self.assertEqual(user.read([fname])[0][fname], group2.id)

    def test_reified_groups_on_change(self):
        """Test that a change on a reified fields trigger the onchange of groups_id."""
        group_public = self.env.ref('base.group_public')
        group_portal = self.env.ref('base.group_portal')
        group_user = self.env.ref('base.group_user')

        # Build the reified group field name
        user_groups = group_public | group_portal | group_user
        user_groups_ids = [str(group_id) for group_id in sorted(user_groups.ids)]
        group_field_name = f"sel_groups_{'_'.join(user_groups_ids)}"

        user_form = Form(self.env['res.users'], view='base.view_users_form')
        user_form.name = "Test"
        user_form.login = "Test"
        self.assertFalse(user_form.share)

        setattr(user_form, group_field_name, group_portal.id)
        self.assertTrue(user_form.share, 'The groups_id onchange should have been triggered')

        setattr(user_form, group_field_name, group_user.id)
        self.assertFalse(user_form.share, 'The groups_id onchange should have been triggered')

        setattr(user_form, group_field_name, group_public.id)
        self.assertTrue(user_form.share, 'The groups_id onchange should have been triggered')

    def test_user_group_inheritance_no_warning(self):
        """
            Category:
                Sales
                ├── Manager
                └── User
                Field Service
                ├── Manager
                └── User

            Groups:
                Sales Manager
                └── Sales User

                Field Service Manager
                ├── Sales Manager
                └── Field Service User

            When User tries to change the Sales and Field Service Groups as Manager, warning
            should not be raise.
        """
        cat_foo = self.env['ir.module.category'].create({'name': 'Foo'})
        cat_bar = self.env['ir.module.category'].create({'name': 'Bar'})

        group_user_foo, group_manager_foo = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_foo.id}
            for name in ('User', 'Manager')
        ])

        group_user_bar, group_manager_bar = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_bar.id}
            for name in ('User', 'Manager')
        ])

        group_manager_foo.implied_ids = group_user_foo
        group_manager_bar.implied_ids = (group_manager_foo | group_user_bar).ids

        warning = (group_manager_foo | group_manager_bar).check_group_inheritance()
        self.assertFalse(warning)

    def test_user_group_parent_inheritance_no_warning(self):
        """
            Category:
                Timesheets
                ├── Administrator
                ├── User: all timesheets
                └── User: own timesheets only
                Field Service
                ├── Manager
                └── User

            Groups:
                Timesheets Administrator
                └── Timesheets User: all timesheets
                    └── Timesheets User: own timesheets only

                Field Service Manager
                └── Field Service User
                    └── Timesheets User: own timesheets only

            Here, Field Service User will automatically apply the Timesheets User: own timesheets only
            User has Timesheets Administrator group and make changes For Field Service User.
            now, User already have Timesheet Administrator group so it will automatially Apply User Own timesheet,
            so in that case warning shouldn't be raised.
        """
        cat_foo = self.env['ir.module.category'].create({'name': 'Foo'})
        cat_bar = self.env['ir.module.category'].create({'name': 'Bar'})

        group_visitor_foo, group_user_foo, group_manager_foo = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_foo.id}
            for name in ('Visitor', 'User', 'Manager')
        ])

        group_user_bar, group_manager_bar = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_bar.id}
            for name in ('User', 'Manager')
        ])

        group_manager_foo.implied_ids = group_user_foo
        group_user_foo.implied_ids = group_visitor_foo

        group_manager_bar.implied_ids = group_user_bar
        group_user_bar.implied_ids = group_visitor_foo

        warning = (group_manager_foo | group_user_bar).check_group_inheritance()

        self.assertFalse(warning)

    def test_user_group_inheritance_warning(self):
        """
            Category:
                Sales
                ├── Manager
                └── User
                Field Service
                ├── Manager
                └── User

            Groups:
                Sales Manager
                └── Sales User

                Field Service Manager
                ├── Sales Manager
                └── Field Service User

            Here Sales Manager is required when We have Field service as a Manager.
            so, When user tries to change the Sales as a user, it will show the warning
            about Sales Manager required since we have Field service as a manager
        """
        cat_foo = self.env['ir.module.category'].create({'name': 'Foo'})
        cat_bar = self.env['ir.module.category'].create({'name': 'Bar'})

        group_user_foo, group_manager_foo = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_foo.id}
            for name in ('User', 'Manager')
        ])

        group_user_bar, group_manager_bar = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_bar.id}
            for name in ('User', 'Manager')
        ])

        group_manager_foo.implied_ids = group_user_foo
        group_manager_bar.implied_ids = (group_manager_foo | group_user_bar).ids

        warning = (group_user_foo | group_user_bar | group_manager_bar).check_group_inheritance()

        self.assertTrue(warning)
        self.assertEqual(warning[group_user_foo.id], 'Since you are a/an Bar Manager, you cannot have Foo right lower than Manager')

    def test_user_multi_group_inheritance_warning(self):
        """
            Category:
                Sales
                ├── Manager
                └── User
                Project
                ├── Manager
                └── User
                Field Service
                ├── Manager
                └── User

            Groups:
                Sales Manager
                └── Sales User

                Project Manager
                └── Project User

                Field Service Manager
                ├── Sales Manager
                ├── Project Manager
                └── Field Service User

            Here, If user has Field service manager then it will automatically apply
            the Sales Manager and Project manager.
            Now, User has Sales, Project and Field Service as user and make changes in
            Field Service as a Manager, it will show the Warning in Both Project and
            Sales for group inconsistency.
        """
        cat_foo = self.env['ir.module.category'].create({'name': 'Foo'})
        cat_bar = self.env['ir.module.category'].create({'name': 'Bar'})
        cat_baz = self.env['ir.module.category'].create({'name': 'Baz'})

        group_user_foo, group_manager_foo = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_foo.id}
            for name in ('User', 'Manager')
        ])

        group_user_bar, group_manager_bar = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_bar.id}
            for name in ('User', 'Manager')
        ])

        group_user_baz, group_manager_baz = self.env['res.groups'].create([
            {'name': name, 'category_id': cat_baz.id}
            for name in ('User', 'Manager')
        ])

        group_manager_foo.implied_ids = group_user_foo
        group_manager_bar.implied_ids = (group_manager_foo | group_user_bar).ids
        group_manager_baz.implied_ids = (group_manager_bar | group_manager_foo | group_user_baz).ids

        warnings = (group_manager_baz | group_user_foo | group_user_bar).check_group_inheritance()
        self.assertTrue(warnings)
        self.assertDictEqual(warnings, {
            group_user_foo.id: 'Since you are a/an Baz Manager, you cannot have Foo right lower than Manager',
            group_user_bar.id: 'Since you are a/an Baz Manager, you cannot have Bar right lower than Manager'
        })
