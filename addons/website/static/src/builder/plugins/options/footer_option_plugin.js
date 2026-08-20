import { registry } from "@web/core/registry";
import { Plugin } from "@html_editor/plugin";
import { FooterTemplateChoice } from "./footer_template_option";
import { _t } from "@web/core/l10n/translation";
import { WebsiteConfigAction } from "../customize_website_plugin";

/** @typedef {import("@odoo/owl").Component} Component */

/**
 * @typedef { Object } FooterOptionShared
 * @property { FooterOptionPlugin['getFooterTemplates'] } getFooterTemplates
 */
/**
 * @typedef {(() => Promise<{
 *     key: string,
 *     Component: Component,
 *     props: any,
 * }[]>)[]} footer_templates_providers
 */

export class FooterOptionPlugin extends Plugin {
    static id = "footerOption";
    static dependencies = ["customizeWebsite", "builderActions"];
    static shared = ["getFooterTemplates"];

    /** @type {import("plugins").WebsiteResources} */
    resources = {
        builder_actions: {
            WebsiteConfigFooterAction,
        },
        auto_unfold_container_providers: { selector: "#footer > section", target: "footer" },
        on_prepare_drag_handlers: this.prepareDrag.bind(this),
        is_node_removable_predicates: (node) => {
            if (node.id === "o_footer_scrolltop") {
                return false;
            }
        },
        immutable_link_selectors: [".o_cookie_policy_link_container a.oe_unremovable"],
        footer_templates_providers: [
            () =>
                [
                    { name: "default", title: _t("Default"), view: "website.footer_custom" },
                    { name: "descriptive", title: _t("Descriptive") },
                    { name: "centered", title: _t("Centered") },
                    { name: "links", title: _t("Links") },
                    { name: "minimalist", title: _t("Minimalist") },
                    { name: "contact", title: _t("Contact") },
                    { name: "call_to_action", title: _t("Call-to-action") },
                    { name: "headline", title: _t("Headline") },
                    { name: "mega", title: _t("Mega") },
                    { name: "mega_columns", title: _t("Mega Columns") },
                    { name: "mega_links", title: _t("Mega Links") },
                    { name: "mega_cards", title: _t("Mega Cards") },
                ].map((info) => ({
                    key: info.name,
                    Component: FooterTemplateChoice,
                    props: {
                        imgSrc: `/website/static/src/img/snippets_options/footer_template_${info.name}.svg`,
                        varName: info.name,
                        view: info.view ?? `website.template_footer_${info.name}`,
                        title: info.title,
                        resetViewArch: true
                    },
                })),
        ],
    };

    prepareDrag() {
        // Remove the footer scroll effect if it has one (because the footer
        // dropzone flickers otherwise when it is in grid mode).
        let restore = () => {};
        const wrapwrapEl = this.editable;
        const hasFooterScrollEffect = wrapwrapEl.classList.contains("o_footer_effect_enable");
        if (hasFooterScrollEffect) {
            wrapwrapEl.classList.remove("o_footer_effect_enable");
            restore = () => {
                wrapwrapEl.classList.add("o_footer_effect_enable");
            };
        }
        return restore;
    }

    async getFooterTemplates() {
        const templatesByProvider = await Promise.all(
            this.getResource("footer_templates_providers").map((provider) => provider())
        );
        return templatesByProvider.flat();
    }
}

export class WebsiteConfigFooterAction extends WebsiteConfigAction {
    static id = "websiteConfigFooter";
}

registry.category("website-plugins").add(FooterOptionPlugin.id, FooterOptionPlugin);
