# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import odoo.tests


@odoo.tests.tagged('post_install', '-at_install')
class TestWebsiteCrm(odoo.tests.HttpCase):

    def test_tour(self):
        all_utm_campaign = self.env['utm.campaign'].search([])
        utm_medium = self.env['utm.medium'].create({'name': 'Medium', 'identifier': 'test_medium'})
        utm_source = self.env['utm.source'].create({'name': 'Source', 'identifier': 'test_source'})

        self.start_tour("/", 'website_crm_tour')

        # check result
        record = self.env['crm.lead'].search([('description', '=', '### TOUR DATA ###')])
        self.assertEqual(len(record), 1)
        self.assertEqual(record.contact_name, 'John Smith')
        self.assertEqual(record.email_from, 'john@smith.com')
        self.assertEqual(record.partner_name, 'Odoo S.A.')

        # check UTM records
        self.assertEqual(record.source_id, utm_source)
        self.assertEqual(record.medium_id, utm_medium)
        self.assertNotIn(record.campaign_id, all_utm_campaign, 'Should have created a new campaign')
        self.assertEqual(record.campaign_id.name, 'new_campaign_[XXXXX]', 'Name of the "on the fly" created campaign is wrong')
        self.assertEqual(record.campaign_id.identifier, 'new_campaign_[XXXXX]', 'Identifier of the "on the fly" created campaign is wrong')
