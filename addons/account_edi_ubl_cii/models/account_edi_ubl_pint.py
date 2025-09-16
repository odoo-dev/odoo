# -*- coding: utf-8 -*-
from markupsafe import Markup
from typing import Literal

from odoo import models, _
from odoo.addons.account.tools import dict_to_xml
from odoo.addons.account_edi_ubl_cii.models.account_edi_xml_ubl_20 import UBL_NAMESPACES

from stdnum.no import mva


class AccountEdiUblPint(models.AbstractModel):
    _name = 'account.edi.ubl_pint'
    _inherit = ['account.edi.ubl']
    _description = "PINT"
