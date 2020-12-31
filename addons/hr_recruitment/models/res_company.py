# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models

class ResCompany(models.Model):
    _inherit = "res.company"

    def _get_default_interview_template(self):
        return """
<p>
    <b>Which country are you from?</b><br/><br/>
    <b>From which university did or will you graduate?</b><br/><br/>
    <b>Were you referred by an employee?</b><br/><br/>
    <b>Education</b><br/><br/>
    <b>Past work experiences</b><br/><br/>
    <b> Knowledge</b><br/><br/>
    <b>Activities</b><br/><br/>
    <b>What is important for you?</b><br/><br/>
</p>"""

    interview_template = fields.Html(default=_get_default_interview_template)
