# -*- encoding: utf-8 -*-
##############################################################################
#
#    OpenERP, Open Source Management Solution
#    Copyright (C) 2015-TODAY OpenERP s.a. (<http://www.openerp.com>)
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

{
    'name': 'Slovenian Accounting',
    'version': '0.9',
    'author': 'OpenERP s.a.',
    'website': 'http://www.odoo.com',
    'description':
"""
This module supports expands the Anglo-Saxon accounting methodology according to Slovenian legislation
======================================================================================================
Slovenian accounting expansion uses same input and output interim accounts depending if it is supplier
or customer document.
""",
    'images': [],
    'depends': ['purchase'],
    'category': 'Accounting & Finance',
    'demo': [],
    'data': [],
    'auto_install': False,
    'installable': True,
}
