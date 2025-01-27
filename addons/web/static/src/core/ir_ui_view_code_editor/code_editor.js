/** @odoo-module **/
import { useEffect } from "@odoo/owl";
import { CodeEditor } from "@web/core/code_editor/code_editor";
import { escapeRegExp } from "@web/core/utils/strings";

export class IrUiViewCodeEditor extends CodeEditor {
    static props = {
        ...this.props,
        record: { type: Object },
    };

    setup() {
        super.setup(...arguments);
        this.markers = [];

        useEffect(
            (arch, invalid_xpaths_from_arch) => {
                if (arch && invalid_xpaths_from_arch) {
                    this.highlightInvalidXpaths(arch, invalid_xpaths_from_arch);
                    return () => this.clearMarkers();
                }
            },
            () => [
                this.props.record?.data.arch_base,
                this.props.record?.data.invalid_xpaths_from_arch,
            ]
        );
    }

    async highlightInvalidXpaths(arch, invalid_xpaths_from_arch) {
        const resModel = this.env.model?.config.resModel;
        const resId = this.env.model?.config.resId;
        if (resModel === "ir.ui.view" && resId) {
            const { doc } = this.aceEditor.session;
            for (const [expr, sourceline] of invalid_xpaths_from_arch) {
                const escapedExpr = escapeRegExp(expr);
                const xpathRegex = new RegExp(
                    `<xpath\\s+([^>]*?)expr\\s*=\\s*"(${escapedExpr})"[^>]*>`,
                    "g"
                );
                for (const match of arch.matchAll(xpathRegex)) {
                    const startIndex = match.index;
                    const endIndex = startIndex + match[0].length;
                    const startPos = doc.indexToPosition(startIndex);
                    const endPos = doc.indexToPosition(endIndex);
                    if (startPos.row + 1 === sourceline) {
                        const range = new window.ace.Range(
                            startPos.row,
                            startPos.column,
                            endPos.row,
                            endPos.column
                        );
                        this.markers.push(
                            this.aceEditor.session.addMarker(range, "invalid_xpath", "text")
                        );
                    }
                }
            }
        }
    }

    clearMarkers() {
        this.markers.forEach((marker) => this.aceEditor.session.removeMarker(marker));
        this.markers = [];
    }
}
