# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import lxml
from . import controllers
from . import models
from . import report
from . import wizard


def _update_demo_data(env):
    """
        Some demo data was not processed by QWeb as a dynamic placeholder field (represented by a <t t-out=""/> tag)
        needed to remain unprocessed.
        As such, social headers and footers were not rendered.
        This method adds in the missing header and footer.
    """
    module_mass_mailing = env['ir.module.module']._get('mass_mailing')
    if module_mass_mailing.demo:
        demo_mailing = env.ref('mass_mailing.mass_mail_sale_order_0')
        mailing_header = env['ir.qweb']._render('mass_mailing.s_mail_block_header_logo_and_stacked_menu', {'company_id': env.ref('base.main_company'), 'res_company': env.ref('base.main_company')})
        mailing_footer = env['ir.qweb']._render('mass_mailing.s_mail_block_footer_social', {'company_id': env.ref('base.main_company'), 'res_company': env.ref('base.main_company')})

        root = lxml.html.fromstring(demo_mailing.body_arch)
        for replace_tag in root.findall('.//replace_by'):
            if replace_tag.attrib['snippet'] == 'header':
                new_el = lxml.html.fromstring(mailing_header)
            elif replace_tag.attrib['snippet'] == 'footer':
                new_el = lxml.html.fromstring(mailing_footer)
            parent = replace_tag.getparent()
            parent.insert(parent.index(replace_tag), new_el)
            parent.remove(replace_tag)

        demo_mailing.body_arch = lxml.html.tostring(root, encoding='unicode')
