import { append, createElement } from "@web/core/utils/xml";
import { FormCompiler } from "@web/views/form/form_compiler";
import { toStringExpression } from "@web/views/utils";

export class SettingsFormCompiler extends FormCompiler {
    setup() {
        super.setup();
        this.compilers.push(
            { selector: "app", fn: this.compileApp },
            { selector: "block", fn: this.compileBlock }
        );
    }

    compileForm(el, params) {
        const settingsPage = createElement("SettingsPage");
        settingsPage.setAttribute(
            "slots",
            "{NoContentHelper:__comp__.props.slots.NoContentHelper}"
        );
        settingsPage.setAttribute("initialTab", "__comp__.props.initialApp");
        settingsPage.setAttribute("t-slot-scope", "settings");

        //props
        params.modules = [];
        params.anchors = [];

        const res = super.compileForm(...arguments);
        res.classList.remove("o_form_nosheet");

        settingsPage.setAttribute("modules", JSON.stringify(params.modules));

        // Move the compiled content of the form inside the settingsPage
        while (res.firstChild) {
            append(settingsPage, res.firstChild);
        }

        settingsPage.setAttribute("anchors", JSON.stringify(params.anchors));

        append(res, settingsPage);

        return res;
    }

    compileApp(el, params) {
        if (el.getAttribute("notApp") === "1") {
            //An app noted with notApp="1" is not rendered.

            //This hack is used when a technical module defines settings, and we don't want to render
            //the settings until the corresponding app is not installed.

            // For example, when installing the module website_sale, the module sale is also installed,
            // but we don't want to render its settings (notApp="1").
            // On the contrary, when sale_management is installed, the module sale is also installed
            // but in this case we want to see its settings (notApp="0").
            return;
        }
        const module = {
            key: el.getAttribute("name"),
            string: el.getAttribute("string"),
            imgurl:
                el.getAttribute("logo") ||
                "/" + el.getAttribute("name") + "/static/description/icon.png",
        };
        params.modules.push(module);
        const settingsApp = createElement("SettingsApp", {
            key: toStringExpression(module.key),
            string: toStringExpression(module.string || ""),
            imgurl: toStringExpression(module.imgurl),
            selectedTab: "settings.selectedTab",
        });

        for (const child of el.children) {
            append(settingsApp, this.compileNode(child, params));
        }
        params.anchors.push(
            ...[...settingsApp.querySelectorAll("SearchableSetting")].flatMap((s) => {
                if (!s.id) {
                    return [];
                }
                return {
                    app: module.key,
                    settingId: s.id.replaceAll("`", ""),
                    fieldNames: [...s.querySelectorAll("Field")].flatMap((el) => {
                        const name = el.getAttribute("name");
                        return name ? [name.replaceAll("'", "")] : [];
                    }),
                };
            })
        );
        return settingsApp;
    }

    compileBlock(el, params) {
        params.blockTitle = toStringExpression(el.getAttribute("title") || "");
        params.blockTip = toStringExpression(el.getAttribute("help") || "");
        const settingsBlock = createElement("SettingsBlock", {
            title: params.blockTitle,
            tip: params.blockTip,
        });
        params.settings = [];
        for (const child of el.children) {
            append(settingsBlock, this.compileNode(child, params));
        }
        settingsBlock.setAttribute(
            "t-if",
            `__comp__.isBlockVisible(${blockId}, ${params.settings})`
        );
        return settingsBlock;
    }

    compileSetting(el, params) {
        params.componentName =
            el.getAttribute("type") === "header" ? "SettingHeader" : "SearchableSetting";
        const res = super.compileSetting(el, params);
        const fieldName = res.getAttribute("fieldName");
        const string = res.getAttribute("string");
        const help = res.getAttribute("help");
        params.settings.push({
            id: plop,
            fieldName,
            string,
            help,
        });
        res.setAttribute(
            "t-if",
            `__comp__.isSettingVisible(${fieldName}, ${string}, ${help}, ${params.blockTitle}, ${params.blockTip})`
        );
        return res;
    }
}
