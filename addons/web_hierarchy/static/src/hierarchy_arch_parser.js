import { visitXML } from "@web/core/utils/xml";
import { stringToOrderBy } from "@web/search/utils/order_by";
import { CardArchParser } from "@web/views/card/card_arch_parser";
import { exprToBoolean } from "@web/core/utils/strings";


export class HierarchyArchParser {
    parse(xmlDoc, models, modelName) {
        const cardArchInfo = new CardArchParser().parse(xmlDoc, models, modelName);

        const archInfo = {
            ...cardArchInfo,
            cardArchInfo,
            avatarField: null,
            defaultOrder: stringToOrderBy(xmlDoc.getAttribute("default_order") || null),
            draggable: false,
            parentFieldName: "parent_id",
        };
        
        const fields = models[modelName].fields;

        visitXML(xmlDoc, (node) => {
            if (node.tagName === "hierarchy") {
                if (node.hasAttribute("parent_field")) {
                    const parentFieldName = node.getAttribute("parent_field");
                    if (!(parentFieldName in fields)) {
                        throw new Error(`The parent field set (${parentFieldName}) is not defined in the model (${modelName}).`);
                    } else if (fields[parentFieldName].type !== "many2one") {
                        throw new Error(`Invalid parent field, it should be a Many2One field.`);
                    } else if (fields[parentFieldName].relation !== modelName) {
                        throw new Error(`Invalid parent field, the co-model should be same model than the current one (expected: ${modelName}).`);
                    }
                    archInfo.parentFieldName = parentFieldName;
                }
                if (node.hasAttribute("child_field")) {
                    const childFieldName = node.getAttribute("child_field");
                    if (!(childFieldName in fields)) {
                        throw new Error(`The child field set (${childFieldName}) is not defined in the model (${modelName}).`);
                    } else if (fields[childFieldName].type !== "one2many") {
                        throw new Error(`Invalid child field, it should be a One2Many field.`);
                    } else if (fields[childFieldName].relation !== modelName) {
                        throw new Error(`Invalid child field, the co-model should be same model than the current one (expected: ${modelName}).`);
                    }
                    archInfo.childFieldName = childFieldName;
                }
                if (node.hasAttribute("draggable")) {
                    archInfo.draggable = exprToBoolean(node.getAttribute("draggable"));
                }
                if (node.hasAttribute("avatar_field")) {
                    const avatarField = node.getAttribute("avatar_field");
                    if (!(avatarField in fields)) {
                        throw new Error(`The avatar field (${avatarField}) is not defined in the model (${modelName}).`);
                    }
                    archInfo.avatarField = avatarField;
                }
            }
        });

        return archInfo;
    }
}
