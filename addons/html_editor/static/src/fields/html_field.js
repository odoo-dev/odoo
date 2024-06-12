import { COLLABORATION_PLUGINS, MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { Component, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useBus } from "@web/core/utils/hooks";
import { useRecordObserver } from "@web/model/relational_model/utils";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { HtmlViewer } from "./html_viewer";

/**
 * Check whether the current value contains nodes that would break
 * on insertion inside an existing body.
 *
 * @returns {boolean} true if 'this.props.value' contains a node
 * that can only exist once per document.
 */
function computeContainsComplexHTML(value) {
    const domParser = new DOMParser();
    if (!value) {
        return false;
    }
    const parsedOriginal = domParser.parseFromString(value, "text/html");
    return !!parsedOriginal.head.innerHTML.trim();
}

export class HtmlField extends Component {
    static template = "html_editor.HtmlField";
    static props = {
        ...standardFieldProps,
        isCollaborative: { type: Boolean, optional: true },
        cssReadonlyAssetId: { type: String, optional: true },
        sandboxedPreview: { type: Boolean, optional: true },
        editorConfig: { type: Object, optional: true },
    };
    static components = {
        Wysiwyg,
        HtmlViewer,
    };

    setup() {
        this.codeViewRef = useRef("codeView");

        const { model } = this.props.record;
        useBus(model.bus, "WILL_SAVE_URGENTLY", () => this.commitChanges({ urgent: true }));
        useBus(model.bus, "NEED_LOCAL_CHANGES", ({ detail }) =>
            detail.proms.push(this.commitChanges())
        );
        this.busService = this.env.services.bus_service;

        this.isDirty = false;
        this.state = useState({
            key: 0,
            showCodeView: false,
            containsComplexHTML: computeContainsComplexHTML(
                this.props.record.data[this.props.name]
            ),
        });
        this.lastValue = this.props.record.data[this.props.name].toString();
        useRecordObserver((record) => {
            // Reset Wysiwyg when we discard or onchange value
            if (this.lastValue !== record.data[this.props.name].toString()) {
                this.state.key++;
                this.state.containsComplexHTML = computeContainsComplexHTML(
                    this.props.record.data[this.props.name]
                );
            }
        });
    }

    get value() {
        return this.props.record.data[this.props.name];
    }

    get displayReadonly() {
        return this.props.readonly || (this.sandboxedPreview && !this.state.showCodeView);
    }

    get wysiwygKey() {
        return `${this.props.record.resId}_${this.state.key}`;
    }

    get sandboxedPreview() {
        // @todo @phoenix maybe remove containsComplexHTML and alway use sandboxedPreview options
        return this.props.sandboxedPreview || this.state.containsComplexHTML;
    }

    async updateValue() {
        this.lastValue = this.state.showCodeView
            ? this.codeViewRef.el.value
            : this.editor.getContent();
        await this.props.record.update({ [this.props.name]: this.lastValue });
        this.props.record.model.bus.trigger("FIELD_IS_DIRTY", false);
        this.isDirty = false;
    }

    async commitChanges({ urgent } = {}) {
        if (this.isDirty) {
            if (this.state.showCodeView) {
                await this.updateValue();
                return;
            }

            const savePendingImagesPromise = this.editor.shared.savePendingImages();
            if (urgent) {
                await this.updateValue();
            }
            const isDirty = await savePendingImagesPromise;
            if (isDirty || !urgent) {
                await this.updateValue();
            }
        }
    }

    onEditorLoad(editor) {
        this.editor = editor;
    }

    onChange() {
        this.isDirty = true;
        this.props.record.model.bus.trigger("FIELD_IS_DIRTY", true);
    }

    onBlur() {
        if (this.isDirty) {
            return this.updateValue();
        }
    }

    async toggleCodeView() {
        if (this.state.showCodeView) {
            await this.updateValue();
        }
        this.state.showCodeView = !this.state.showCodeView;
    }

    getConfig() {
        const { resId, resModel } = this.props.record;
        const config = {
            content: this.props.record.data[this.props.name],
            Plugins: [
                ...MAIN_PLUGINS,
                ...(this.props.isCollaborative ? COLLABORATION_PLUGINS : []),
            ],
            classList: this.classList,
            onChange: this.onChange.bind(this),
            busService: this.busService,
            collaborationChannel: this.props.isCollaborative && {
                collaborationModelName: this.props.record.resModel,
                collaborationFieldName: this.props.name,
                collaborationResId: parseInt(this.props.record.resId),
            },
            peerId: this.generateId(),
            recordInfo: { resModel, resId },
            dropImageAsAttachment: true, // @todo @phoenix always true ?
            ...this.props.editorConfig,
        };
        return config;
    }

    generateId() {
        // No need for secure random number.
        return Math.floor(Math.random() * Math.pow(2, 52)).toString();
    }
}

export const htmlField = {
    component: HtmlField,
    displayName: _t("Html"),
    supportedTypes: ["html"],
    extractProps({ attrs, options }, dynamicInfo) {
        const editorConfig = {};
        if (attrs.placeholder) {
            editorConfig.placeholder = attrs.placeholder;
        }
        return {
            editorConfig,
            isCollaborative: options.collaborative,
            sandboxedPreview: Boolean(options.sandboxedPreview),
            cssReadonlyAssetId: options.cssReadonly,
        };
    },
};

registry.category("fields").add("html", htmlField, { force: true });
