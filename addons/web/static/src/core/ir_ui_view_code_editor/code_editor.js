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

            for (const spec of invalid_xpaths_from_arch) {
                const { tag, attrib, sourceline, invalid_attrib } = spec;
                const escapedTag = escapeRegExp(tag);
                const attribPatterns = [];

                for (const [key, value] of Object.entries(attrib)) {
                    const escapedKey = escapeRegExp(key);
                    const escapedValue = escapeRegExp(value);

                    attribPatterns.push(`(?=.*\\b${escapedKey}\\s*=\\s*["']${escapedValue}["'])`);
                }
                const attribRegex = attribPatterns.join("");

                const regexPattern = `<${escapedTag}\\s+${attribRegex}[^>]*>`;

                const nodeRegex = new RegExp(regexPattern, "g");
                for (const match of arch.matchAll(nodeRegex)) {
                    const startIndex = match.index;
                    const endIndex = startIndex + match[0].length;

                    const startPos = doc.indexToPosition(startIndex);
                    const endPos = doc.indexToPosition(endIndex);

                    if (startPos.row + 1 === sourceline) {
                        const attribRegexSingle = new RegExp(
                            `\\b${escapeRegExp(invalid_attrib)}\\s*=\\s*(['"])(.*?)\\1`,
                            "i"
                        );

                        const attribMatch = attribRegexSingle.exec(match[0]);

                        if (attribMatch) {
                            const attribStartInMatch = attribMatch.index;
                            const attribEndInMatch = attribStartInMatch + attribMatch[0].length;

                            const attribStartIndex = startIndex + attribStartInMatch;
                            const attribEndIndex = startIndex + attribEndInMatch;

                            const attribStartPos = doc.indexToPosition(attribStartIndex);
                            const attribEndPos = doc.indexToPosition(attribEndIndex);

                            const range = new window.ace.Range(
                                attribStartPos.row,
                                attribStartPos.column,
                                attribEndPos.row,
                                attribEndPos.column
                            );

                            this.markers.push(
                                this.aceEditor.session.addMarker(range, "invalid_xpath", "text")
                            );
                        }
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
