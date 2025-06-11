import { exprToBoolean } from "@web/core/utils/strings";
import { visitXML } from "@web/core/utils/xml";
import { combineModifiers } from "@web/model/relational_model/utils";
import { Field } from "@web/views/fields/field";
import { getActiveActions, processButton } from "@web/views/utils";
import { Widget } from "@web/views/widgets/widget";

export class FormArchParser {
    parse(xmlDoc, models, modelName) {
        const jsClass = xmlDoc.getAttribute("js_class");
        const disableAutofocus = exprToBoolean(xmlDoc.getAttribute("disable_autofocus") || "");
        const activeActions = getActiveActions(xmlDoc);
        const fieldNodes = {};
        const widgetNodes = {};
        let widgetNextId = 0;
        const fieldNextIds = {};
        const autofocusFieldIds = [];
        let footerButtons = [];
        let displayGenericButtons = true;
        let button_id = 0;
        visitXML(xmlDoc, (node) => {
            if (node.tagName === "field") {
                const fieldInfo = Field.parseFieldNode(node, models, modelName, "form", jsClass);
                if (!(fieldInfo.name in fieldNextIds)) {
                    fieldNextIds[fieldInfo.name] = 0;
                }
                const fieldId = `${fieldInfo.name}_${fieldNextIds[fieldInfo.name]++}`;
                fieldNodes[fieldId] = fieldInfo;
                node.setAttribute("field_id", fieldId);
                if (exprToBoolean(node.getAttribute("default_focus") || "")) {
                    autofocusFieldIds.push(fieldId);
                }
                if (fieldInfo.type === "properties") {
                    activeActions.addPropertyFieldValue = true;
                }
                return false;
            } else if (node.tagName === "widget") {
                const widgetInfo = Widget.parseWidgetNode(node);
                const widgetId = `widget_${++widgetNextId}`;
                widgetNodes[widgetId] = widgetInfo;
                node.setAttribute("widget_id", widgetId);
            } else if (node.tagName === "footer") {
                displayGenericButtons = false;
                const invisible = node.getAttribute("invisible");
                const replace = node.getAttribute("replace");
                if (replace && !exprToBoolean(replace)) {
                    displayGenericButtons = true;
                }
                footerButtons = footerButtons.concat(
                    [...node.children]
                        .filter((node) => node.tagName === "button")
                        .map((node) => ({
                            ...this.processButton(node, invisible),
                            type: "button",
                            id: button_id++,
                        }))
                );
            }
        });
        return {
            activeActions,
            autofocusFieldIds,
            disableAutofocus,
            displayGenericButtons,
            fieldNodes,
            footerButtons,
            widgetNodes,
            xmlDoc,
        };
    }
    processButton(node, footerModifier = null) {
        const text = node.textContent.trim();
        const button = processButton(node);
        let { invisible } = button;
        if (footerModifier) {
            invisible = combineModifiers(footerModifier, invisible, "OR");
        }
        return {
            ...button,
            string: text ? text : button.string,
            invisible,
        };
    }
}
