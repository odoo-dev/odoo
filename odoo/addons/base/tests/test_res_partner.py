# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from contextlib import contextmanager
from unittest.mock import patch

from odoo import Command
from odoo.addons.base.models.res_partner import Partner
from odoo.addons.base.tests.common import TransactionCaseWithUserDemo
from odoo.exceptions import AccessError, RedirectWarning, UserError, ValidationError
from odoo.tests import Form
from odoo.tests.common import tagged, TransactionCase

# samples use effective TLDs from the Mozilla public suffix
# list at http://publicsuffix.org
SAMPLES = [
    ('"Raoul Grosbedon" <raoul@chirurgiens-dentistes.fr> ', 'Raoul Grosbedon', 'raoul@chirurgiens-dentistes.fr'),
    ('ryu+giga-Sushi@aizubange.fukushima.jp', 'ryu+giga-sushi@aizubange.fukushima.jp', 'ryu+giga-sushi@aizubange.fukushima.jp'),
    ('Raoul chirurgiens-dentistes.fr', 'Raoul chirurgiens-dentistes.fr', ''),
    (" Raoul O'hara  <!@historicalsociety.museum>", "Raoul O'hara", '!@historicalsociety.museum'),
    ('Raoul Grosbedon <raoul@CHIRURGIENS-dentistes.fr> ', 'Raoul Grosbedon', 'raoul@chirurgiens-dentistes.fr'),
    ('Raoul megaraoul@chirurgiens-dentistes.fr', 'Raoul', 'megaraoul@chirurgiens-dentistes.fr'),
]


@tagged('res_partner')
class TestPartner(TransactionCaseWithUserDemo):

    @contextmanager
    def mockPartnerCalls(self):
        _original_create = Partner.create
        self._new_partners = self.env['res.partner']

        def _res_partner_create(model, *args, **kwargs):
            records = _original_create(model, *args, **kwargs)
            self._new_partners += records.sudo()
            return records

        with patch.object(Partner, 'create',
                          autospec=True, side_effect=_res_partner_create):
            yield

    def _check_find_or_create(self, test_string, expected_name, expected_email, expected_partner=False):
        with self.mockPartnerCalls():
            partner = self.env['res.partner'].find_or_create(test_string)
        if expected_partner:
            self.assertEqual(
                partner, expected_partner,
                f'Should have found {expected_partner.name} ({expected_partner.id}), found {partner.name} ({partner.id}) instead')
            self.assertFalse(self._new_partners)
        else:
            self.assertEqual(
                partner, self._new_partners,
                f'Should have created a partner, found {partner.name} ({partner.id}) instead'
            )
        self.assertEqual(partner.name, expected_name)
        self.assertEqual(partner.email or '', expected_email)
        return partner

    def test_archive_internal_partners(self):
        test_partner = self.env['res.partner'].create({'name':'test partner'})
        test_user = self.env['res.users'].create({
                                'login': 'test@odoo.com',
                                'partner_id': test_partner.id,
                                })
        # Cannot archive the partner
        with self.assertRaises(RedirectWarning):
            test_partner.with_user(self.env.ref('base.user_admin')).toggle_active()
        with self.assertRaises(ValidationError):
            test_partner.with_user(self.user_demo).toggle_active()

        # Can archive the user but the partner stays active
        test_user.toggle_active()
        self.assertTrue(test_partner.active, 'Parter related to user should remain active')

        # Now we can archive the partner
        test_partner.toggle_active()

        # Activate the user should reactivate the partner
        test_user.toggle_active()
        self.assertTrue(test_partner.active, 'Activating user must active related partner')

    def test_email_formatted(self):
        """ Test various combinations of name / email, notably to check result
        of email_formatted field. """
        # multi create
        new_partners = self.env['res.partner'].create([{
            'name': "Vlad the Impaler",
            'email': f'vlad.the.impaler.{idx:02d}@example.com',
        } for idx in range(2)])
        self.assertEqual(
            sorted(new_partners.mapped('email_formatted')),
            sorted([f'"Vlad the Impaler" <vlad.the.impaler.{idx:02d}@example.com>' for idx in range(2)]),
            'Email formatted should be "name" <email>'
        )

        # test name_create with formatting / multi emails
        for source, (exp_name, exp_email, exp_email_formatted) in [
            (
                'Balázs <vlad.the.negociator@example.com>, vlad.the.impaler@example.com',
                ("Balázs", "vlad.the.negociator@example.com", '"Balázs" <vlad.the.negociator@example.com>')
            ),
            (
                'Balázs <vlad.the.impaler@example.com>',
                ("Balázs", "vlad.the.impaler@example.com", '"Balázs" <vlad.the.impaler@example.com>')
            ),
        ]:
            with self.subTest(source=source):
                new_partner_id = self.env['res.partner'].name_create(source)[0]
                new_partner = self.env['res.partner'].browse(new_partner_id)
                self.assertEqual(new_partner.name, exp_name)
                self.assertEqual(new_partner.email, exp_email)
                self.assertEqual(
                    new_partner.email_formatted, exp_email_formatted,
                    'Name_create should take first found email'
                )

        # check name updates
        for source, exp_email_formatted in [
            ('Vlad the Impaler', '"Vlad the Impaler" <vlad.the.impaler@example.com>'),
            ('Balázs', '"Balázs" <vlad.the.impaler@example.com>'),
            ('Balázs <email.in.name@example.com>', '"Balázs <email.in.name@example.com>" <vlad.the.impaler@example.com>'),
        ]:
            with self.subTest(source=source):
                new_partner.write({'name': source})
                self.assertEqual(new_partner.email_formatted, exp_email_formatted)

        # check email updates
        new_partner.write({'name': 'Balázs'})
        for source, exp_email_formatted in [
            # encapsulated email
            (
                "Vlad the Impaler <vlad.the.impaler@example.com>",
                '"Balázs" <vlad.the.impaler@example.com>'
            ), (
                '"Balázs" <balazs@adam.hu>',
                '"Balázs" <balazs@adam.hu>'
            ),
            # multi email
            (
                "vlad.the.impaler@example.com, vlad.the.dragon@example.com",
                '"Balázs" <vlad.the.impaler@example.com,vlad.the.dragon@example.com>'
            ), (
                "vlad.the.impaler.com, vlad.the.dragon@example.com",
                '"Balázs" <vlad.the.dragon@example.com>'
            ), (
                'vlad.the.impaler.com, "Vlad the Dragon" <vlad.the.dragon@example.com>',
                '"Balázs" <vlad.the.dragon@example.com>'
            ),
            # falsy emails
            (False, False),
            ('', False),
            (' ', '"Balázs" <@ >'),
            ('notanemail', '"Balázs" <@notanemail>'),
        ]:
            with self.subTest(source=source):
                new_partner.write({'email': source})
                self.assertEqual(new_partner.email_formatted, exp_email_formatted)

    def test_find_or_create(self):
        original_partner = self.env['res.partner'].browse(
            self.env['res.partner'].name_create(SAMPLES[0][0])[0]
        )
        all_partners = []

        for (text_input, expected_name, expected_email), expected_partner, find_idx in zip(
            SAMPLES,
            [original_partner, False, False, False, original_partner, False,
             # patrick example
             False, False, False,
             # multi email
             False],
            [0, 0, 0, 0, 0, 0, 0, 6, 0, 0],
        ):
            with self.subTest(text_input=text_input):
                if not expected_partner and find_idx:
                    expected_partner = all_partners[find_idx]
                all_partners.append(
                    self._check_find_or_create(
                        text_input, expected_name, expected_email,
                        expected_partner=expected_partner,
                    )
                )

    def test_is_public(self):
        """ Check that base.partner_user is a public partner."""
        self.assertFalse(self.env.ref('base.public_user').active)
        self.assertFalse(self.env.ref('base.public_partner').active)
        self.assertTrue(self.env.ref('base.public_partner').is_public)

    def test_lang_computation_code(self):
        """ Check computation of lang: coming from installed languages, forced
        default value and propagation from parent."""
        default_lang_info = self.env['res.lang'].get_installed()[0]
        default_lang_code = default_lang_info[0]
        self.assertNotEqual(default_lang_code, 'de_DE')  # should not be the case, just to ease test
        self.assertNotEqual(default_lang_code, 'fr_FR')  # should not be the case, just to ease test

        # default is installed lang
        partner = self.env['res.partner'].create({'name': "Test Company"})
        self.assertEqual(partner.lang, default_lang_code)

        # check propagation of parent to child
        child = self.env['res.partner'].create({'name': 'First Child', 'parent_id': partner.id})
        self.assertEqual(child.lang, default_lang_code)

        # activate another languages to test language propagation when being in multi-lang
        self.env['res.lang']._activate_lang('de_DE')
        self.env['res.lang']._activate_lang('fr_FR')

        # default from context > default from installed
        partner = self.env['res.partner'].with_context(default_lang='de_DE').create({'name': "Test Company"})
        self.assertEqual(partner.lang, 'de_DE')
        first_child = self.env['res.partner'].create({'name': 'First Child', 'parent_id': partner.id})
        partner.write({'lang': 'fr_FR'})
        second_child = self.env['res.partner'].create({'name': 'Second Child', 'parent_id': partner.id})

        # check user input is kept
        self.assertEqual(partner.lang, 'fr_FR')
        self.assertEqual(first_child.lang, 'de_DE')
        self.assertEqual(second_child.lang, 'fr_FR')

    def test_name_create(self):
        res_partner = self.env['res.partner']
        for text, expected_name, expected_mail in SAMPLES:
            with self.subTest(text=text):
                partner_id, dummy = res_partner.name_create(text)
                partner = res_partner.browse(partner_id)
                self.assertEqual(expected_name or expected_mail.lower(), partner.name)
                self.assertEqual(expected_mail.lower() or False, partner.email)

        # name_create supports default_email fallback
        partner = self.env['res.partner'].browse(
            self.env['res.partner'].with_context(
                default_email='John.Wick@example.com'
            ).name_create('"Raoulette Vachette" <Raoul@Grosbedon.fr>')[0]
        )
        self.assertEqual(partner.name, 'Raoulette Vachette')
        self.assertEqual(partner.email, 'raoul@grosbedon.fr')

        partner = self.env['res.partner'].browse(
            self.env['res.partner'].with_context(
                default_email='John.Wick@example.com'
            ).name_create('Raoulette Vachette')[0]
        )
        self.assertEqual(partner.name, 'Raoulette Vachette')
        self.assertEqual(partner.email, 'John.Wick@example.com')

    def test_name_search(self):
        res_partner = self.env['res.partner']
        sources = [
            ('"A Raoul Grosbedon" <raoul@chirurgiens-dentistes.fr>', False),
            ('B Raoul chirurgiens-dentistes.fr', True),
            ("C Raoul O'hara  <!@historicalsociety.museum>", True),
            ('ryu+giga-Sushi@aizubange.fukushima.jp', True),
        ]
        for name, active in sources:
            _partner_id, dummy = res_partner.with_context(default_active=active).name_create(name)
        partners = res_partner.name_search('Raoul')
        self.assertEqual(len(partners), 2, 'Incorrect search number result for name_search')
        partners = res_partner.name_search('Raoul', limit=1)
        self.assertEqual(len(partners), 1, 'Incorrect search number result for name_search with a limit')
        self.assertEqual(partners[0][1], 'B Raoul chirurgiens-dentistes.fr', 'Incorrect partner returned, should be the first active')

    def test_name_search_with_user(self):
        """ Check name_search on partner, especially with domain based on auto_join
        user_ids field. Check specific SQL of name_search correctly handle joined tables. """
        test_partner = self.env['res.partner'].create({'name': 'Vlad the Impaler'})
        test_user = self.env['res.users'].create({'name': 'Vlad the Impaler', 'login': 'vlad', 'email': 'vlad.the.impaler@example.com'})

        ns_res = self.env['res.partner'].name_search('Vlad', operator='ilike')
        self.assertEqual(set(i[0] for i in ns_res), set((test_partner | test_user.partner_id).ids))

        ns_res = self.env['res.partner'].name_search('Vlad', args=[('user_ids.email', 'ilike', 'vlad')])
        self.assertEqual(set(i[0] for i in ns_res), set(test_user.partner_id.ids))

        # Check a partner may be searched when current user has no access but sudo is used
        public_user = self.env.ref('base.public_user')
        with self.assertRaises(AccessError):
            test_partner.with_user(public_user).check_access_rule('read')
        ns_res = self.env['res.partner'].with_user(public_user).sudo().name_search('Vlad', args=[('user_ids.email', 'ilike', 'vlad')])
        self.assertEqual(set(i[0] for i in ns_res), set(test_user.partner_id.ids))

    def test_partner_merge_wizard_dst_partner_id(self):
        """ Check that dst_partner_id in merge wizard displays id along with partner name """
        test_partner = self.env['res.partner'].create({'name': 'Radu the Handsome'})
        expected_partner_name = '%s (%s)' % (test_partner.name, test_partner.id)

        partner_merge_wizard = self.env['base.partner.merge.automatic.wizard'].with_context(
            {'partner_show_db_id': True, 'default_dst_partner_id': test_partner}).new()
        self.assertEqual(
            partner_merge_wizard.dst_partner_id.display_name, expected_partner_name,
            "'Destination Contact' name should contain db ID in brackets"
        )


@tagged('res_partner')
class TestPartnerAddressCompany(TransactionCase):

    def test_address(self):
        res_partner = self.env['res.partner']
        ghoststep = res_partner.create({
            'name': 'GhostStep',
            'is_company': True,
            'street': 'Main Street, 10',
            'phone': '123456789',
            'email': 'info@ghoststep.com',
            'vat': 'BE0477472701',
            'type': 'contact',
        })
        p1 = res_partner.browse(res_partner.name_create('Denis Bladesmith <denis.bladesmith@ghoststep.com>')[0])
        self.assertEqual(p1.type, 'contact', 'Default type must be "contact"')
        p1phone = '123456789#34'
        p1.write({'phone': p1phone,
                  'parent_id': ghoststep.id})
        self.assertEqual(p1.street, ghoststep.street, 'Address fields must be synced')
        self.assertEqual(p1.phone, p1phone, 'Phone should be preserved after address sync')
        self.assertEqual(p1.type, 'contact', 'Type should be preserved after address sync')
        self.assertEqual(p1.email, 'denis.bladesmith@ghoststep.com', 'Email should be preserved after sync')

        # turn off sync
        p1street = 'Different street, 42'
        p1.write({'street': p1street,
                  'type': 'invoice'})
        self.assertEqual(p1.street, p1street, 'Address fields must not be synced after turning sync off')
        self.assertNotEqual(ghoststep.street, p1street, 'Parent address must never be touched')

        # turn on sync again
        p1.write({'type': 'contact'})
        self.assertEqual(p1.street, ghoststep.street, 'Address fields must be synced again')
        self.assertEqual(p1.phone, p1phone, 'Phone should be preserved after address sync')
        self.assertEqual(p1.type, 'contact', 'Type should be preserved after address sync')
        self.assertEqual(p1.email, 'denis.bladesmith@ghoststep.com', 'Email should be preserved after sync')

        # Modify parent, sync to children
        ghoststreet = 'South Street, 25'
        ghoststep.write({'street': ghoststreet})
        self.assertEqual(p1.street, ghoststreet, 'Address fields must be synced automatically')
        self.assertEqual(p1.phone, p1phone, 'Phone should not be synced')
        self.assertEqual(p1.email, 'denis.bladesmith@ghoststep.com', 'Email should be preserved after sync')

        p1street = 'My Street, 11'
        p1.write({'street': p1street})
        self.assertEqual(ghoststep.street, ghoststreet, 'Touching contact should never alter parent')

    def test_address_first_contact_sync(self):
        """ Test initial creation of company/contact pair where contact address gets copied to
        company """
        res_partner = self.env['res.partner']
        ironshield = res_partner.browse(res_partner.name_create('IronShield')[0])
        self.assertFalse(ironshield.is_company, 'Partners are not companies by default')
        self.assertEqual(ironshield.type, 'contact', 'Default type must be "contact"')
        ironshield.write({'type': 'contact'})

        p1 = res_partner.create({
            'name': 'Isen Hardearth',
            'street': 'Strongarm Avenue, 12',
            'parent_id': ironshield.id,
        })
        self.assertEqual(p1.type, 'contact', 'Default type must be "contact", not the copied parent type')
        self.assertEqual(ironshield.street, p1.street, 'Address fields should be copied to company')

    def test_address_get(self):
        """ Test address_get address resolution mechanism: it should first go down through descendants,
        stopping when encountering another is_copmany entity, then go up, stopping again at the first
        is_company entity or the root ancestor and if nothing matches, it should use the provided partner
        itself """
        res_partner = self.env['res.partner']
        elmtree = res_partner.browse(res_partner.name_create('Elmtree')[0])
        branch1 = res_partner.create({'name': 'Branch 1',
                                      'parent_id': elmtree.id,
                                      'is_company': True})
        leaf10 = res_partner.create({'name': 'Leaf 10',
                                     'parent_id': branch1.id,
                                     'type': 'invoice'})
        branch11 = res_partner.create({'name': 'Branch 11',
                                       'parent_id': branch1.id,
                                       'type': 'other'})
        leaf111 = res_partner.create({'name': 'Leaf 111',
                                      'parent_id': branch11.id,
                                      'type': 'delivery'})
        branch11.write({'is_company': False})  # force is_company after creating 1rst child
        branch2 = res_partner.create({'name': 'Branch 2',
                                      'parent_id': elmtree.id,
                                      'is_company': True})
        leaf21 = res_partner.create({'name': 'Leaf 21',
                                     'parent_id': branch2.id,
                                     'type': 'delivery'})
        leaf22 = res_partner.create({'name': 'Leaf 22',
                                     'parent_id': branch2.id})
        leaf23 = res_partner.create({'name': 'Leaf 23',
                                     'parent_id': branch2.id,
                                     'type': 'contact'})

        # go up, stop at branch1
        self.assertEqual(leaf111.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf111.id,
                          'invoice': leaf10.id,
                          'contact': branch1.id,
                          'other': branch11.id}, 'Invalid address resolution')
        self.assertEqual(branch11.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf111.id,
                          'invoice': leaf10.id,
                          'contact': branch1.id,
                          'other': branch11.id}, 'Invalid address resolution')

        # go down, stop at at all child companies
        self.assertEqual(elmtree.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': elmtree.id,
                          'invoice': elmtree.id,
                          'contact': elmtree.id,
                          'other': elmtree.id}, 'Invalid address resolution')

        # go down through children
        self.assertEqual(branch1.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf111.id,
                          'invoice': leaf10.id,
                          'contact': branch1.id,
                          'other': branch11.id}, 'Invalid address resolution')

        self.assertEqual(branch2.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf21.id,
                          'invoice': branch2.id,
                          'contact': branch2.id,
                          'other': branch2.id}, 'Invalid address resolution. Company is the first encountered contact, therefore default for unfound addresses.')

        # go up then down through siblings
        self.assertEqual(leaf21.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf21.id,
                          'invoice': branch2.id,
                          'contact': branch2.id,
                          'other': branch2.id}, 'Invalid address resolution, should scan commercial entity ancestor and its descendants')
        self.assertEqual(leaf22.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf21.id,
                          'invoice': leaf22.id,
                          'contact': leaf22.id,
                          'other': leaf22.id}, 'Invalid address resolution, should scan commercial entity ancestor and its descendants')
        self.assertEqual(leaf23.address_get(['delivery', 'invoice', 'contact', 'other']),
                         {'delivery': leaf21.id,
                          'invoice': leaf23.id,
                          'contact': leaf23.id,
                          'other': leaf23.id}, 'Invalid address resolution, `default` should only override if no partner with specific type exists')

        # empty adr_pref means only 'contact'
        self.assertEqual(elmtree.address_get([]),
                        {'contact': elmtree.id}, 'Invalid address resolution, no contact means commercial entity ancestor')
        self.assertEqual(leaf111.address_get([]),
                        {'contact': branch1.id}, 'Invalid address resolution, no contact means finding contact in ancestors')
        branch11.write({'type': 'contact'})
        self.assertEqual(leaf111.address_get([]),
                        {'contact': branch11.id}, 'Invalid address resolution, branch11 should now be contact')

    def test_commercial_partner_nullcompany(self):
        """ The commercial partner is the first/nearest ancestor-or-self which
        is a company or doesn't have a parent
        """
        P = self.env['res.partner']
        p0 = P.create({'name': '0', 'email': '0'})
        self.assertEqual(p0.commercial_partner_id, p0, "partner without a parent is their own commercial partner")

        p1 = P.create({'name': '1', 'email': '1', 'parent_id': p0.id})
        self.assertEqual(p1.commercial_partner_id, p0, "partner's parent is their commercial partner")
        p12 = P.create({'name': '12', 'email': '12', 'parent_id': p1.id})
        self.assertEqual(p12.commercial_partner_id, p0, "partner's GP is their commercial partner")

        p2 = P.create({'name': '2', 'email': '2', 'parent_id': p0.id, 'is_company': True})
        self.assertEqual(p2.commercial_partner_id, p2, "partner flagged as company is their own commercial partner")
        p21 = P.create({'name': '21', 'email': '21', 'parent_id': p2.id})
        self.assertEqual(p21.commercial_partner_id, p2, "commercial partner is closest ancestor with themselves as commercial partner")

        p3 = P.create({'name': '3', 'email': '3', 'is_company': True})
        self.assertEqual(p3.commercial_partner_id, p3, "being both parent-less and company should be the same as either")

        notcompanies = p0 | p1 | p12 | p21
        self.env.cr.execute('update res_partner set is_company=null where id = any(%s)', [notcompanies.ids])
        for parent in notcompanies:
            p = P.create({
                'name': parent.name + '_sub',
                'email': parent.email + '_sub',
                'parent_id': parent.id,
            })
            self.assertEqual(
                p.commercial_partner_id,
                parent.commercial_partner_id,
                "check that is_company=null is properly handled when looking for ancestor"
            )

    def test_commercial_field_sync(self):
        """Check if commercial fields are synced properly: testing with VAT field"""
        Partner = self.env['res.partner']
        company_1 = Partner.create({'name': 'company 1', 'is_company': True, 'vat': 'BE0123456789'})
        company_2 = Partner.create({'name': 'company 2', 'is_company': True, 'vat': 'BE9876543210'})

        partner = Partner.create({'name': 'someone', 'is_company': False, 'parent_id': company_1.id})
        Partner.flush_recordset()
        self.assertEqual(partner.vat, company_1.vat, "VAT should be inherited from the company 1")

        # create a delivery address for the partner
        delivery = Partner.create({'name': 'somewhere', 'type': 'delivery', 'parent_id': partner.id})
        self.assertEqual(delivery.commercial_partner_id.id, company_1.id, "Commercial partner should be recomputed")
        self.assertEqual(delivery.vat, company_1.vat, "VAT should be inherited from the company 1")

        # move the partner to another company
        partner.write({'parent_id': company_2.id})
        partner.flush_recordset()
        self.assertEqual(partner.commercial_partner_id.id, company_2.id, "Commercial partner should be recomputed")
        self.assertEqual(partner.vat, company_2.vat, "VAT should be inherited from the company 2")
        self.assertEqual(delivery.commercial_partner_id.id, company_2.id, "Commercial partner should be recomputed on delivery")
        self.assertEqual(delivery.vat, company_2.vat, "VAT should be inherited from the company 2 to delivery")

    def test_commercial_sync(self):
        res_partner = self.env['res.partner']
        p0 = res_partner.create({'name': 'Sigurd Sunknife',
                                 'email': 'ssunknife@gmail.com'})
        sunhelm = res_partner.create({'name': 'Sunhelm',
                                      'is_company': True,
                                      'street': 'Rainbow Street, 13',
                                      'phone': '1122334455',
                                      'email': 'info@sunhelm.com',
                                      'vat': 'BE0477472701',
                                      'child_ids': [Command.link(p0.id),
                                                    Command.create({'name': 'Alrik Greenthorn',
                                                            'email': 'agr@sunhelm.com'})]})
        p1 = res_partner.create({'name': 'Otto Blackwood',
                                 'email': 'otto.blackwood@sunhelm.com',
                                 'parent_id': sunhelm.id})
        p11 = res_partner.create({'name': 'Gini Graywool',
                                  'email': 'ggr@sunhelm.com',
                                  'parent_id': p1.id})
        p2 = res_partner.search([('email', '=', 'agr@sunhelm.com')], limit=1)
        sunhelm.write({'child_ids': [Command.create({'name': 'Ulrik Greenthorn',
                                             'email': 'ugr@sunhelm.com'})]})
        p3 = res_partner.search([('email', '=', 'ugr@sunhelm.com')], limit=1)

        for p in (p0, p1, p11, p2, p3):
            self.assertEqual(p.commercial_partner_id, sunhelm, 'Incorrect commercial entity resolution')
            self.assertEqual(p.vat, sunhelm.vat, 'Commercial fields must be automatically synced')
        sunhelmvat = 'BE0123456749'
        sunhelm.write({'vat': sunhelmvat})
        for p in (p0, p1, p11, p2, p3):
            self.assertEqual(p.vat, sunhelmvat, 'Commercial fields must be automatically and recursively synced')

        p1vat = 'BE0987654394'
        p1.write({'vat': p1vat})
        for p in (sunhelm, p0, p11, p2, p3):
            self.assertEqual(p.vat, sunhelmvat, 'Sync to children should only work downstream and on commercial entities')

        # promote p1 to commercial entity
        p1.write({'parent_id': sunhelm.id,
                  'is_company': True,
                  'name': 'Sunhelm Subsidiary'})
        self.assertEqual(p1.vat, p1vat, 'Setting is_company should stop auto-sync of commercial fields')
        self.assertEqual(p1.commercial_partner_id, p1, 'Incorrect commercial entity resolution after setting is_company')

        # writing on parent should not touch child commercial entities
        sunhelmvat2 = 'BE0112233453'
        sunhelm.write({'vat': sunhelmvat2})
        self.assertEqual(p1.vat, p1vat, 'Setting is_company should stop auto-sync of commercial fields')
        self.assertEqual(p0.vat, sunhelmvat2, 'Commercial fields must be automatically synced')

    def test_company_change_propagation(self):
        """ Check propagation of company_id across children """
        User = self.env['res.users']
        Partner = self.env['res.partner']
        Company = self.env['res.company']

        company_1 = Company.create({'name': 'company_1'})
        company_2 = Company.create({'name': 'company_2'})

        test_partner_company = Partner.create({'name': 'This company'})
        test_user = User.create({'name': 'This user', 'login': 'thisu', 'email': 'this.user@example.com', 'company_id': company_1.id, 'company_ids': [company_1.id]})
        test_user.partner_id.write({'parent_id': test_partner_company.id})

        test_partner_company.write({'company_id': company_1.id})
        self.assertEqual(test_user.partner_id.company_id.id, company_1.id, "The new company_id of the partner company should be propagated to its children")

        test_partner_company.write({'company_id': False})
        self.assertFalse(test_user.partner_id.company_id.id, "If the company_id is deleted from the partner company, it should be propagated to its children")

        with self.assertRaises(UserError, msg="You should not be able to update the company_id of the partner company if the linked user of a child partner is not an allowed to be assigned to that company"), self.cr.savepoint():
            test_partner_company.write({'company_id': company_2.id})

    def test_display_address_missing_key(self):
        """ Check _display_address when some keys are missing. As a defaultdict is used, missing keys should be
        filled with empty strings. """
        country = self.env["res.country"].create({"name": "TestCountry", "address_format": "%(city)s %(zip)s", "code": "ZV"})
        partner = self.env["res.partner"].create({
            "name": "TestPartner",
            "country_id": country.id,
            "city": "TestCity",
            "zip": "12345",
        })
        before = partner._display_address()
        # Manually update the country address_format because placeholders are checked by create
        self.env.cr.execute(
            "UPDATE res_country SET address_format ='%%(city)s %%(zip)s %%(nothing)s' WHERE id=%s",
            [country.id]
        )
        self.env["res.country"].invalidate_model()
        self.assertEqual(before, partner._display_address().strip())

    def test_display_name(self):
        """ Check display_name on partner, especially with different context
        Check display_name correctly return name with context. """
        test_partner_jetha = self.env['res.partner'].create({'name': 'Jethala', 'street': 'Powder gali', 'street2': 'Gokuldham Society'})
        test_partner_bhide = self.env['res.partner'].create({'name': 'Atmaram Bhide'})

        res_jetha = test_partner_jetha.with_context(show_address=1).display_name
        self.assertEqual(res_jetha, "Jethala\nPowder gali\nGokuldham Society", "name should contain comma separated name and address")
        res_bhide = test_partner_bhide.with_context(show_address=1).display_name
        self.assertEqual(res_bhide, "Atmaram Bhide", "name should contain only name if address is not available, without extra commas")

        res_jetha = test_partner_jetha.with_context(show_address=1, address_inline=1).display_name
        self.assertEqual(res_jetha, "Jethala, Powder gali, Gokuldham Society", "name should contain comma separated name and address")
        res_bhide = test_partner_bhide.with_context(show_address=1, address_inline=1).display_name
        self.assertEqual(res_bhide, "Atmaram Bhide", "name should contain only name if address is not available, without extra commas")


@tagged('res_partner', 'post_install', '-at_install')
class TestPartnerForm(TransactionCase):
    # those tests are made post-install because they need module 'web' for the
    # form view to work properly

    def test_lang_computation_form_view(self):
        """ Check computation of lang: coming from installed languages, forced
        default value and propagation from parent."""
        default_lang_info = self.env['res.lang'].get_installed()[0]
        default_lang_code = default_lang_info[0]
        self.assertNotEqual(default_lang_code, 'de_DE')  # should not be the case, just to ease test
        self.assertNotEqual(default_lang_code, 'fr_FR')  # should not be the case, just to ease test

        # default is installed lang
        partner_form = Form(self.env['res.partner'], 'base.view_partner_form')
        partner_form.name = "Test Company"
        self.assertEqual(partner_form.lang, default_lang_code, "New partner's lang should be default one")
        partner = partner_form.save()
        self.assertEqual(partner.lang, default_lang_code)

        # check propagation of parent to child
        with partner_form.child_ids.new() as child:
            child.name = "First Child"
            self.assertEqual(child.lang, default_lang_code, "Child contact's lang should have the same as its parent")
        partner = partner_form.save()
        self.assertEqual(partner.child_ids.lang, default_lang_code)

        # activate another languages to test language propagation when being in multi-lang
        self.env['res.lang']._activate_lang('de_DE')
        self.env['res.lang']._activate_lang('fr_FR')

        # default from context > default from installed
        partner_form = Form(
            self.env['res.partner'].with_context(default_lang='de_DE'),
            'base.view_partner_form'
        )
        # <field name="is_company" invisible="1"/>
        # <field name="company_type" widget="radio" options="{'horizontal': true}"/>
        # @api.onchange('company_type')
        # def onchange_company_type(self):
        #     self.is_company = (self.company_type == 'company')
        partner_form.company_type = 'company'
        partner_form.name = "Test Company"
        self.assertEqual(partner_form.lang, 'de_DE', "New partner's lang should take default from context")
        with partner_form.child_ids.new() as child:
            child.name = "First Child"
            self.assertEqual(child.lang, 'de_DE', "Child contact's lang should be the same as its parent.")
        partner_form.lang = 'fr_FR'
        self.assertEqual(partner_form.lang, 'fr_FR', "New partner's lang should take user input")
        with partner_form.child_ids.new() as child:
            child.name = "Second Child"
            self.assertEqual(child.lang, 'fr_FR', "Child contact's lang should be the same as its parent.")
        partner = partner_form.save()

        # check final values (kept from form input)
        self.assertEqual(partner.lang, 'fr_FR')
        self.assertEqual(partner.child_ids.filtered(lambda p: p.name == "First Child").lang, 'de_DE')
        self.assertEqual(partner.child_ids.filtered(lambda p: p.name == "Second Child").lang, 'fr_FR')

    def test_onchange_parent_sync_user(self):
        company_1 = self.env['res.company'].create({'name': 'company_1'})
        test_user = self.env['res.users'].create({
            'name': 'This user',
            'login': 'thisu',
            'email': 'this.user@example.com',
            'company_id': company_1.id,
            'company_ids': [company_1.id],
        })
        test_parent_partner = self.env['res.partner'].create({
            'company_type': 'company',
            'name': 'Micheline',
            'user_id': test_user.id,
        })
        with Form(self.env['res.partner']) as partner_form:
            partner_form.parent_id = test_parent_partner
            partner_form.company_type = 'person'
            partner_form.name = 'Philip'
            self.assertEqual(partner_form.user_id, test_parent_partner.user_id)


@tagged('res_partner')
class TestPartnerRecursion(TransactionCase):

    def setUp(self):
        super(TestPartnerRecursion, self).setUp()
        res_partner = self.env['res.partner']
        self.p1 = res_partner.browse(res_partner.name_create('Elmtree')[0])
        self.p2 = res_partner.create({'name': 'Elmtree Child 1', 'parent_id': self.p1.id})
        self.p3 = res_partner.create({'name': 'Elmtree Grand-Child 1.1', 'parent_id': self.p2.id})

    def test_100_res_partner_recursion(self):
        self.assertTrue(self.p3._check_recursion())
        self.assertTrue((self.p1 + self.p2 + self.p3)._check_recursion())

    # split 101, 102, 103 tests to force SQL rollback between them

    def test_101_res_partner_recursion(self):
        with self.assertRaises(ValidationError):
            self.p1.write({'parent_id': self.p3.id})

    def test_102_res_partner_recursion(self):
        with self.assertRaises(ValidationError):
            self.p2.write({'parent_id': self.p3.id})

    def test_103_res_partner_recursion(self):
        with self.assertRaises(ValidationError):
            self.p3.write({'parent_id': self.p3.id})

    def test_104_res_partner_recursion_indirect_cycle(self):
        """ Indirect hacky write to create cycle in children """
        p3b = self.p1.create({'name': 'Elmtree Grand-Child 1.2', 'parent_id': self.p2.id})
        with self.assertRaises(ValidationError):
            self.p2.write({'child_ids': [Command.update(self.p3.id, {'parent_id': p3b.id}),
                                         Command.update(p3b.id, {'parent_id': self.p3.id})]})

    def test_105_res_partner_recursion(self):
        with self.assertRaises(ValidationError):
            (self.p3 + self.p1).parent_id = self.p2

    def test_106_res_partner_recursion_performance(self):
        # old approach
        from collections import defaultdict
        from odoo.tools import SQL
        import itertools

        from odoo.tools import check_relation_loop

        def _check_recursion_legacy(cr, table, col1, col2, col1_in):
            """
            Verifies that there is no loop in a hierarchical structure of records,
            by following the parent relationship using the **parent** field until a
            loop is detected or until a top-level record is found.

            :param parent: optional parent field name (default: ``self._parent_name``)
            :return: **True** if no loop was found, **False** otherwise.
            """
            for id in col1_in:
                current_id = id
                seen_ids = {current_id}
                while current_id:
                    cr.execute(SQL(
                        "SELECT %s FROM %s WHERE %s = %s",
                        SQL.identifier(col2), SQL.identifier(table), SQL.identifier(col1), current_id,
                    ))
                    result = cr.fetchone()
                    current_id = result[0] if result else None
                    if current_id in seen_ids:
                        return False
            return True

        cr = self.env.cr

        cr.execute(
            """
            CREATE TABLE test_recursion_m2o (
                col1 INTEGER PRIMARY KEY,
                col2 INTEGER
            );
            CREATE INDEX ON test_recursion_m2o (col1);
            CREATE INDEX ON test_recursion_m2o (col2);
            """
        )

        root_node = 1
        num_children_per_node = 4
        tree_depth = 8

        first_n = (num_children_per_node ** tree_depth - 1) // (num_children_per_node - 1) + root_node
        last_n = first_n + num_children_per_node ** tree_depth - 2 + root_node

        def generate_tree_relations(root, num_children, depth):
            if depth == 0:
                return []

            current_node = root
            relations = []
            level_d = [root]
            while depth:
                new_level_d = []
                for n in level_d:
                    for i in range(num_children):
                        current_node += 1
                        new_level_d.append(current_node)
                        relations.append((current_node, n))  # child -> parent
                level_d = new_level_d
                depth -= 1

            return relations

        tree_relations = generate_tree_relations(root_node, num_children_per_node, tree_depth)

        cr.execute(SQL(
            """
            INSERT INTO test_recursion_m2o (col1, col2) VALUES %s
            """,
            SQL(', ').join(tree_relations)
        ))
        col1_in = [first_n, first_n + 1, first_n + 2, first_n + 3, last_n]

        import timeit

        t1 = timeit.timeit("check_relation_loop(cr, 'test_recursion_m2o', 'col1', 'col2', col1_in)", number=10, globals=locals())
        t2 = timeit.timeit("_check_recursion_legacy(cr, 'test_recursion_m2o', 'col1', 'col2', col1_in)", number=10, globals=locals())
        print(t1)  # 0.0027043330192100257
        print(t2)  # 0.012238458992214873

    def test_107_res_partner_recursion_m2m_performance(self):
        # old approach
        from collections import defaultdict
        from odoo.tools import SQL
        import itertools

        from odoo.tools import check_relation_loop

        def _check_m2m_recursion_legacy(cr, table, col1, col2, col1_in):
            succs = defaultdict(set)  # transitive closure of successors
            preds = defaultdict(set)  # transitive closure of predecessors
            todo, done = set(col1_in), set()
            while todo:
                # retrieve the respective successors of the nodes in 'todo'
                cr.execute(SQL(
                    """ SELECT %(col1)s, %(col2)s FROM %(rel)s
                        WHERE %(col1)s IN %(ids)s AND %(col2)s IS NOT NULL """,
                    rel=SQL.identifier(table),
                    col1=SQL.identifier(col1),
                    col2=SQL.identifier(col2),
                    ids=tuple(todo),
                ))
                done.update(todo)
                todo.clear()
                for id1, id2 in cr.fetchall():
                    # connect id1 and its predecessors to id2 and its successors
                    for x, y in itertools.product([id1] + list(preds[id1]),
                                                  [id2] + list(succs[id2])):
                        if x == y:
                            return False  # we found a cycle here!
                        succs[x].add(y)
                        preds[y].add(x)
                    if id2 not in done:
                        todo.add(id2)
            return True

        cr = self.env.cr

        cr.execute(
            """
            CREATE TABLE test_recursion_m2m (
                col1 INTEGER NOT NULL,
                col2 INTEGER NOT NULL,
                PRIMARY KEY(col1, col2)
            );
            CREATE INDEX ON test_recursion_m2m (col2, col1);
            """
        )

        children_per_node = 2
        node_per_level = 5
        depth = 10

        def generate_net_relations(children_per_node, node_per_level, depth):
            relations = []
            for d in range(depth):
                node_start = d * node_per_level
                child_start = node_start + node_per_level
                for i in range(node_per_level):
                    node1 = node_start + i
                    for j in range(children_per_node):
                        node2 = child_start + (i + j) % node_per_level
                        relations.append((node1, node2))
            return relations

        net_relations = generate_net_relations(children_per_node, node_per_level, depth)

        cr.execute(SQL(
            """
            INSERT INTO test_recursion_m2m (col1, col2) VALUES %s
            """,
            SQL(', ').join(net_relations)
        ))
        col1_in = list(range(5))

        import timeit
        t1 = timeit.timeit("check_relation_loop(cr, 'test_recursion_m2m', 'col1', 'col2', col1_in)", number=10, globals=locals())
        t2 = timeit.timeit("_check_m2m_recursion_legacy(cr, 'test_recursion_m2m', 'col1', 'col2', col1_in)", number=10, globals=locals())
        print(t1)  # 0.06295079200026521
        print(t2)  # 0.0111943329998212


    def test_110_res_partner_recursion_multi_update(self):
        """ multi-write on several partners in same hierarchy must not trigger a false cycle detection """
        ps = self.p1 + self.p2 + self.p3
        self.assertTrue(ps.write({'phone': '123456'}))

    def test_111_res_partner_recursion_infinite_loop(self):
        """ The recursion check must not loop forever """
        self.p2.parent_id = False
        self.p3.parent_id = False
        self.p1.parent_id = self.p2
        with self.assertRaises(ValidationError):
            (self.p3|self.p2).write({'parent_id': self.p1.id})
