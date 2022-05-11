# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class Article(models.Model):
    _name = 'knowledge.article'
    _inherit = ['knowledge.article', 'website.published.multi.mixin']

    def get_backend_menu_id(self):
        return self.env.ref('knowledge.knowledge_menu_root').id
