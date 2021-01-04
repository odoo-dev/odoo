# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api


class ProductTemplate(models.Model):
    _inherit = "product.template"

    blog_post_ids = fields.Many2many(
        'blog.post',
        'product_blogpost_rel',
        string="Blog Posts",
        help="Related blog posts to a particular product in website.",
    )


class BlogPost(models.Model):
    _inherit = "blog.post"

    product_ids = fields.Many2many(
        'product.template',
        string="Products",
        help="Related products to a particular blog post in website.",
    )
