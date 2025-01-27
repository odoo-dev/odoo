import { patch } from "@web/core/utils/patch";
import { Field } from "@web/views/fields/field";
import { FormArchParser } from "@web/views/form/form_arch_parser";
import { createElement } from "@web/core/utils/xml";

patch(FormArchParser.prototype, {
    parse(xmlDoc, models, modelName) {
        const result = super.parse(...arguments);
        const jsClass = xmlDoc.getAttribute("js_class");
        const chatter = xmlDoc.querySelector("chatter");
        if (chatter && models[modelName].fields["suggested_recipients"]) {
            const field = createElement("field", {
                name: "suggested_recipients",
                invisible: "1"
            });
            const fieldInfo = Field.parseFieldNode(field, models, modelName, "form", jsClass);
            const relatedFields = {
                id: { name: "id", readonly: true, type: "integer" },
                name: { name: "name", readonly: true, type: "char" },
                email: { name: "email", readonly: true, type: "char" },
            };
            fieldInfo.viewMode = "default";
            fieldInfo.views = {
                default: { fieldNodes: relatedFields, fields: relatedFields },
            };
            result.fieldNodes["chatter.suggested_recipients"] = fieldInfo;
        }
        result.has_activities = Boolean(models[modelName].has_activities);
        return result;
    },
});
