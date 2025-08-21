import { removeClass } from "@html_editor/utils/dom";
import { markup, onMounted, useExternalListener } from "@odoo/owl";
import { BASIC_PLUGINS, FULL_EDIT_PLUGINS } from "../../plugins/plugin_sets";
import { useResizer } from "./resizer_hook";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { isMobileOS } from "@web/core/browser/feature_detection";

export class WebsiteForumWysiwyg extends Wysiwyg {
    static template = "website_forum.WebsiteForumWysiwyg";
    static props = {
        ...super.props,
        textareaEl: HTMLElement,
        fullEdit: Boolean,
        getRecordInfo: Function,
        resizable: { type: Boolean, optional: true },
        initialHeight: { type: Number, optional: true },
        minHeight: { type: Number, optional: true },
    };
    static defaultProps = {
        ...super.defaultProps,
        contentClass: "note-editable",
        resizable: !isMobileOS(),
        initialHeight: 350,
        minHeight: 100,
    };

    /** @override */
    setup() {
        super.setup();
        if (this.props.resizable) {
            // Event listener added on template.
            this.onResizerMouseDown = useResizer("content", this.props.minHeight);
        }
        const form = this.props.textareaEl.closest("form");
        // Prevent form submission behavior of buttons inside the form
        onMounted(() =>
            form.querySelectorAll(".o-wysiwyg button").forEach((btn) => (btn.type = "button"))
        );
        this.submitButton = form.querySelector("button[type=submit]");
        useExternalListener(this.submitButton, "click", this.onSubmitButtonClick.bind(this));
        this.readyForSubmit = false;
    }

    /** @override */
    getEditorConfig() {
        return {
            getRecordInfo: this.props.getRecordInfo,
            Plugins: this.props.fullEdit ? FULL_EDIT_PLUGINS : BASIC_PLUGINS,
            content: this.getTextAreaContent(),
            resources: {
                start_edition_handlers: () => this.cleanImageClasses(this.editor.editable),
                clean_for_save_handlers: ({ root }) => this.cleanImageClasses(root),
            },
            defaultLinkAttributes: { rel: "ugc" },
            // TODO: check if this depends on full edit (it does indirectly, as there's
            // no media plugin without full edit)
            dropImageAsAttachment: true,
            allowImageTransform: this.props.fullEdit,
            height: `${this.props.initialHeight}px`,
        };
    }

    cleanImageClasses(root) {
        // float-start class messes up the post layout OPW 769721
        const classNames = ["o_we_selected_image", "float-start"];
        root.querySelectorAll("img").forEach((img) => removeClass(img, ...classNames));
    }

    getTextAreaContent() {
        const textarea = this.props.textareaEl;
        let content = textarea.getAttribute("content") || textarea.value || "";
        if (!content.trim()) {
            content = "<p><br></p>";
        }
        // !!!!! TODO !!!!!: is this safe??
        return markup(content);
    }

    async onSave() {
        await this.editor.shared.media?.savePendingImages();
    }

    onSubmitButtonClick(ev) {
        if (this.readyForSubmit) {
            return;
        }
        ev.preventDefault();
        this.onSave().finally(() => {
            this.props.textareaEl.value = this.editor.getContent();
            this.readyForSubmit = true;
            this.submitButton.click();
        });
    }
}
