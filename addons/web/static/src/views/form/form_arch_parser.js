import { exprToBoolean } from "@web/core/utils/strings";
import { visitXML } from "@web/core/utils/xml";
import { Field } from "@web/views/fields/field";
import { getActiveActions } from "@web/views/utils";
import { Widget } from "@web/views/widgets/widget";

export class FormArchParser {
    parse(xmlDoc, models, modelName) {
        const jsClass = xmlDoc.getAttribute("js_class");
        const disableAutofocus = exprToBoolean(xmlDoc.getAttribute("disable_autofocus") || "");
        const activeActions = getActiveActions(xmlDoc);
        const fieldNodes = {};
        const widgetNodes = {};
        const autofocusFieldIds = [];

        const state = {
            models,
            modelName,
            jsClass,
            fieldNextIds: {},
            fieldNodes,
            autofocusFieldIds,
            activeActions,
            widgetNextId: 0,
            widgetNodes,
        };

        visitXML(xmlDoc, (node) => this.visitNode(node, state));
        return {
            activeActions,
            autofocusFieldIds,
            disableAutofocus,
            fieldNodes,
            widgetNodes,
            xmlDoc,
        };
    }

    visitNode(node, state) {
        if (node.tagName === "field") {
            this.visitField(node, state);
        } else if (node.tagName === "widget") {
            this.visitWidget(node, state);
        }
    }

    visitField(node, state) {
        const fieldInfo = Field.parseFieldNode(
            node,
            state.models,
            state.modelName,
            "form",
            state.jsClass
        );
        if (!(fieldInfo.name in state.fieldNextIds)) {
            state.fieldNextIds[fieldInfo.name] = 0;
        }
        const fieldId = `${fieldInfo.name}_${state.fieldNextIds[fieldInfo.name]++}`;
        state.fieldNodes[fieldId] = fieldInfo;
        node.setAttribute("field_id", fieldId);
        if (exprToBoolean(node.getAttribute("default_focus") || "")) {
            state.autofocusFieldIds.push(fieldId);
        }
        if (fieldInfo.type === "properties" || fieldInfo.type === "properties_definition") {
            state.activeActions.addPropertyFieldValue = true;
        }
        return false;
    }

    visitWidget(node, state) {
        const widgetInfo = Widget.parseWidgetNode(node);
        const widgetId = `widget_${++state.widgetNextId}`;
        state.widgetNodes[widgetId] = widgetInfo;
        node.setAttribute("widget_id", widgetId);
        return false;
    }
}
