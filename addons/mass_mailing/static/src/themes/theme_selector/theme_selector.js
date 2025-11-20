import { Component, markup, onWillStart, useEffect, useState } from "@odoo/owl";
import { loadBundle } from "@web/core/assets";
import { isBrowserSafari } from "@web/core/browser/feature_detection";
import { localization } from "@web/core/l10n/localization";
import { useService } from "@web/core/utils/hooks";
import { renderToFragment } from "@web/core/utils/render";

export class ThemeSelector extends Component {
    static template = "mass_mailing.ThemeSelector";
    static props = {
        config: { type: Object },
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.themeService = useService("mass_mailing.themes");
        this.config = this.props.config;
        this.themes = this.themeService.getThemes();
        this.simpleThemes = this.themeService.getSimpleThemes();
        this.favoriteTemplates = useState([]);
        this.isRTL = localization.direction === "rtl";
        this.renderedTemplatesIndex = {};
        onWillStart(async () => {
            const themeServicePromise = this.themeService.load();
            const favoritePromise = this.orm.call("mailing.mailing", "action_fetch_favorites", [
                this.favoriteDomain,
            ]);
            const [favoriteTemplates] = await Promise.all([favoritePromise, themeServicePromise]);
            Object.assign(
                this.favoriteTemplates,
                favoriteTemplates.map((favorite) => ({
                    html: favorite.body_arch,
                    id: favorite.id,
                    modelId: favorite.mailing_model_id[0],
                    modelName: favorite.mailing_model_id[1],
                    name: `template_${favorite.id}`,
                    nowrap: true,
                    subject: favorite.subject,
                    userId: favorite.user_id[0],
                    userName: favorite.user_id[1],
                }))
            );
        });
        useEffect(
            () => {
                this.updateTemplatePreviews();
                return () => {};
            },
            () => [this.props.config.mailingModelId]
        );
    }

    async updateTemplatePreviews() {
        const activeIframes = document.querySelectorAll(".o_mail_favorite_preview iframe");
        if (activeIframes.length == 0) {
            this.renderedTemplatesIndex = {};
            return;
        }
        const activeTemplates = [...activeIframes].map((iframe) =>
            this.favoriteTemplates.find((t) => t.id == Number(iframe.dataset.id))
        );

        if (activeTemplates.every((t) => this.renderedTemplatesIndex[t.id])) {
            return;
        }

        const iframePromises = [];
        for (const template of activeTemplates) {
            const iframe = document.querySelector("#iframe_fav_" + template.id);

            if (iframe.contentDocument.readyState === "complete") {
                iframePromises.push(this.setupIframe(template, iframe));
            } else {
                iframePromises.push(
                    new Promise((resolve) => {
                        iframe.addEventListener("load", () => resolve());
                    }).then(() => this.setupIframe(template, iframe))
                );
            }
        }
        await Promise.all(iframePromises);

        // Cache the currently-rendered templates' IDs to prevent immediate rerenders on patch
        this.renderedTemplatesIndex = {};
        activeTemplates.map((t) => (this.renderedTemplatesIndex[t.id] = t));
    }

    get favoriteDomain() {
        return this.props.config.filterTemplates
            ? [["mailing_model_id", "=", this.props.config.mailingModelId]]
            : [];
    }

    async onRemoveFavorite(ev, index) {
        ev.stopPropagation();
        const favorite = this.favoriteTemplates[index];
        if (!favorite) {
            return;
        }
        const notificationAction = await this.orm.call(
            "mailing.mailing",
            "action_remove_favorite",
            [favorite.id]
        );
        this.favoriteTemplates.splice(index, 1);
        delete this.renderedTemplatesIndex[favorite.id];
        this.action.doAction(notificationAction);
    }

    onSelectFavorite(html) {
        this.props.config.setThemeHTML(html);
    }

    onSelectTheme(themeOptions) {
        this.props.config.setThemeHTML(themeOptions.html);
    }

    get isBrowserSafari() {
        return isBrowserSafari();
    }

    async setupIframe(template, iframe) {
        iframe.contentDocument.head.appendChild(this.renderHeadContent(template));
        iframe.contentDocument.body.classList.add("o_in_iframe");
        iframe.contentDocument.body.parentElement.classList.add("o_favorite_template_preview");
        iframe.contentDocument.body.style.setProperty("direction", localization.direction);
        iframe.contentDocument.body.append(this.renderBodyContent(template));

        const loadOptions = { targetDoc: iframe.contentDocument, js: false };
        await loadBundle("mass_mailing.assets_iframe_style", loadOptions);

        iframe.style.visibility = null;
    }

    renderHeadContent() {
        return renderToFragment("mass_mailing.IframeHead");
    }

    renderBodyContent(template) {
        return renderToFragment("mass_mailing.FavoriteThemePreviewBody", {
            ...template,
            markedUpHtml: markup(template.html),
            isRTL: this.isRTL,
        });
    }
}
