# -*- coding:utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models
from odoo.tools.translate import LazyTranslate

_lt = LazyTranslate(__name__)


class UtmCampaign(models.Model):
    _inherit = 'utm.campaign'

    _utm_campaign_job = models.Ref(
        'hr_recruitment.utm_campaign_job', 'utm.campaign',
        message=_lt("The UTM campaign '%(name)s' cannot be deleted as it is used in the recruitment process."),
    )
