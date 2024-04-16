/** @odoo-module **/

import { renderToElement } from "@web/core/utils/render";
import Fullscreen from "@website_slides/js/slides_course_fullscreen_player";

Fullscreen.include({
    /**
     * Extend the _renderSlide method so that slides of category "certification"
     * are also taken into account and rendered correctly
     *
     * @private
     * @override
     */
    _renderSlide: function (){
        const def = this._super.apply(this, arguments);
        let content = this.el.querySelector('.o_wslides_fs_content');
        if (this.get('slide').category === "certification"){
            content.innerHTML = '';
            content.append(renderToElement('website.slides.fullscreen.certification',{widget: this}));
        }
        return Promise.all([def]);
    },
});
