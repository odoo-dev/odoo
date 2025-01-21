import { NewContentModal, MODULE_STATUS } from '@website/systray_items/new_content';
import { patch } from "@web/core/utils/patch";

patch(NewContentModal.prototype, {
    setup() {
        super.setup();

        const newBlogElement = this.state.newContentElements.find(element => element.moduleXmlId === 'base.module_website_blog');
        const newBlogPostContext = parseInt(document.querySelector("iframe.o_iframe").contentDocument.querySelector("main #wrap.website_blog [data-oe-model='blog.blog']")?.dataset.oeId);
        const context = newBlogPostContext ? { default_blog_id: newBlogPostContext } : undefined;
        newBlogElement.createNewContent = () => this.onAddContent('website_blog.blog_post_action_add', true, context);
        newBlogElement.status = MODULE_STATUS.INSTALLED;
        newBlogElement.model = 'blog.post';
    },
});
