import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

/**
 * @typedef { Object } ValueHistoryShared
 * @property { ValueHistoryPlugin['setValue'] } setValue
 */

export class ValueHistoryPlugin extends Plugin {
    static id = "valueHistory";
    static dependencies = ["history", "domReferenceMap"];
    static shared = ["setValue"];

    resources = {
        history_operations: {
            id: "formValue",
            apply: ({ nodeId, after }) => {
                this.dependencies.domReferenceMap.getNodeById(nodeId).value = after;
            },
            revert: ({ nodeId, before }) => {
                this.dependencies.domReferenceMap.getNodeById(nodeId).value = before;
            },
        },
    };

    setValue(el, value) {
        const oldValue = el.value;
        this.dependencies.history.applyOperation("formValue", {
            nodeId: this.dependencies.domReferenceMap.register(el),
            before: oldValue,
            after: value,
        });
    }
}

registry.category("website-plugins").add(ValueHistoryPlugin.id, ValueHistoryPlugin);
registry.category("translation-plugins").add(ValueHistoryPlugin.id, ValueHistoryPlugin);
