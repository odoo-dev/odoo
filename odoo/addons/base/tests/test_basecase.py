# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import common

class TestTransactionCase(common.TransactionCase):
    """
    Check the per-method transaction behavior of TransactionCase.
    """

    def test_00(self):
        """ Create a partner. """
        partners = self.env['res.partner'].search([('name', '=', 'test_per_class_teardown_partner')])
        self.assertEqual(0, len(partners), "Test partner found.")
        self.env['res.partner'].create({'name': 'test_per_class_teardown_partner'})
        partners = self.env['res.partner'].search([('name', '=', 'test_per_class_teardown_partner')])
        self.assertEqual(1, len(partners), "Test partner not found.")

    def test_01(self):
        """ Don't find the created partner. """
        partners = self.env['res.partner'].search([('name', '=', 'test_per_class_teardown_partner')])
        self.assertEqual(0, len(partners), "Test partner found.")

    def test_20a(self):
        """ Create a partner with a XML ID then resolve xml id with ref() and browse_ref() """
        pid, _ = self.env['res.partner'].name_create('Mr Yellow')
        self.env['ir.model.data'].create({'name': 'test_partner_yellow',
                                          'module': 'base',
                                          'model': 'res.partner',
                                          'res_id': pid})
        xid = 'base.test_partner_yellow'
        partner = self.env.ref(xid)
        pid = self.ref(xid)
        self.assertEqual(pid, partner.id, "ref() should resolve xid to database ID")
        partner2 = self.browse_ref(xid)
        self.assertEqual(partner, partner2, "browse_ref() should resolve xid to browse records")
