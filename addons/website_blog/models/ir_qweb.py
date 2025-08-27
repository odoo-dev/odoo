from odoo import models

calls = (
    'website_blog.blog_post_short',
        'website_blog.blogs_nav',
            'website.website_search_box_input',
        'website_blog.posts_loop',
            'website_blog.posts_loop_item',
                'website_blog.post_cover_image',
                'website_blog.post_author',
                'website_blog.post_heading',
                'website_blog.post_teaser',
                'website_blog.post_info',
    'website_blog.index',
)

class IrQweb(models.AbstractModel):
    _inherit = 'ir.qweb'

    def _rendering_is_in_cache(self, options, values):
        ref_name = options.get('ref_name')
        if ref_name == 'website_blog.blogs_nav':
            # key_cache, and False to keep 'website.website_search_box_input' rendering outside the cache
            return (values['blogs'], values.get('additionnal_classes')), False

        if ref_name == 'website_blog.posts_loop_item':
            return (values['blog_post'], values['opt_blog_list_view'], values['opt_blog_readable'], values['active_tag_ids']), True
        return super()._rendering_is_in_cache(options, values)
