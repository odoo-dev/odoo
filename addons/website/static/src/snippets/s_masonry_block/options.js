import { SelectTemplate } from "@web_editor/js/editor/snippets.options";
import { registerWebsiteOption } from "@website/js/editor/snippets.registry";

export class MasonryLayout extends SelectTemplate {
    constructor() {
        super(...arguments);
        this.containerSelector = '> .container, > .container-fluid, > .o_container_small';
        this.selectTemplateWidgetName = 'masonry_template_opt';
    }
}

registerWebsiteOption("MasonryLayout", {
    Class: MasonryLayout,
    template: "website.s_masonry_block_options",
    selector: ".s_masonry_block",
}, {
    sequence: 10,
});
