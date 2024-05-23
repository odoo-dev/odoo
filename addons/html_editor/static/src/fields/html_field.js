import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useBus } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class HtmlField extends Component {
    static template = "html_editor.HtmlField";
    static props = { ...standardFieldProps };
    static components = {
        Wysiwyg,
    };

    setup() {
        const { model } = this.props.record;
        useBus(model.bus, "WILL_SAVE_URGENTLY", () => this.commitChanges({ urgent: true }));
        useBus(model.bus, "NEED_LOCAL_CHANGES", ({ detail }) =>
            detail.proms.push(this.commitChanges({ shouldInline: true }))
        );
    }

    async commitChanges() {
        await this.props.record.update({ [this.props.name]: this.editor.getContent() });
    }

    onLoad(editor) {
        this.editor = editor;
    }

    onChange() {
        this.props.record.model.bus.trigger("FIELD_IS_DIRTY", true);
    }

    getConfig() {
        return {
            content: this.props.record.data[this.props.name],
            Plugins: MAIN_PLUGINS,
            classList: this.classList,
            onChange: this.onChange.bind(this),
        };
    }
}

export const htmlField = {
    component: HtmlField,
    displayName: _t("Html"),
    supportedTypes: ["html"],
};

registry.category("fields").add("html", htmlField, { force: true });
