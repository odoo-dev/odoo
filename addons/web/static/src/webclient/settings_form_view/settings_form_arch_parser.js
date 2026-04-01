import { FormArchParser } from "@web/views/form/form_arch_parser";

export class SettingsFormArchParser extends FormArchParser {
    visitNode(node, state, models, modelName) {
        if (node.tagName === "app") {
            const appId = `app_${++this.appNextId}`;
            this.appNodes[appId] = {
                appId,
                key: node.getAttribute("name"),
                string: node.getAttribute("string"),
                imgurl:
                    node.getAttribute("logo") ||
                    "/" + node.getAttribute("name") + "/static/description/icon.png",
            };
            node.setAttribute("setting_app_id", appId);
        } else if (node.tagName === "block") {
            const blockId = `block_${++this.blockNextId}`;

            this.blockNodes[blockId] = {
                blockId,
                appId: `app_${this.appNextId}`,
                blockTitle: node.getAttribute("title"),
                blockTip: node.getAttribute("help"),
            };
            node.setAttribute("setting_block_id", blockId);
        } else if (node.tagName === "setting") {
            const settingId = `setting_${++this.settingNextId}`;
            this.settingNodes[settingId] = {
                settingId,
                appId: `app_${this.appNextId}`,
                blockId: `block_${this.blockNextId}`,
                anchorId: node.getAttribute("id"),
                fieldName: node.getAttribute("fieldName"),
                string: node.getAttribute("string"),
                help: node.getAttribute("help"),
                fieldNames: [],
            };
            node.setAttribute("setting_id", settingId);
            return { settingId };
        } else {
            return super.visitNode(node, state, models, modelName);
        }
    }

    visitField(node, state, params) {
        super.visitField(node, state);
        this.settingNodes[`setting_${this.settingNextId}`]?.fieldNames.push(
            node.getAttribute("name")
        );
        return false;
    }

    parse(xmlDoc, models, modelName) {
        // Clear for this run
        this.appNodes = {};
        this.appNextId = 0;
        this.blockNodes = {};
        this.blockNextId = 0;
        this.settingNodes = {};
        this.settingNextId = 0;

        const result = super.parse(xmlDoc, models, modelName);

        result.appNodes = this.appNodes;
        result.blockNodes = this.blockNodes;
        result.settingNodes = this.settingNodes;

        return result;
    }
}
