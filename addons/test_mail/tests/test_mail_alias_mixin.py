# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.mail.tests.common import MailCommon
from odoo.tests.common import tagged, users


@tagged('mail_alias_mixin')
class TestMailAliasMixin(MailCommon):

    @users('admin')
    def test_mc_alias_create(self):
        """ Test the batch creation of container records like projects or teams in a multi-company
        setup."""

        vals = [{'company_id': company.id} for company in self.env['res.company'].search([])]
        self.company_2.alias_domain_id = None
        self.env['mail.test.container.mc'].create(vals)
