import { Component, onWillStart, status, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { utils as uiUtils } from "@web/core/ui/ui_service";
import { initializeDesignTabCss } from "@mass_mailing/js/mass_mailing_design_constants";

/**
 * @typedef {Object} TemplateInfos
 * @property {string} name
 * @property {string} template
 * @property {[boolean]} nowrap
 * @property {[string]} className
 * @property {[string]} layoutStyles
 * @property {[function]} get_image_info
 */

export class MassMailingTemplateSelector extends Component {
    static template = "mass_mailing.MassMailingTemplateSelector";
    static props = {
        mailingModelId: Number,
        mailingModelName: String,
        filterTemplates: Boolean,
        onSelectMassMailingTemplate: Function,
    };
    setup() {
        this.state = useState({
            templates: [],
            themes: [],
        });
        this.orm = useService("orm");

        onWillStart(async () => {
            const templatesParams = await this.getTemplatesParams();
            // todo: ask web team if doing this check is always necessary?
            if (status(this) === "destroyed") {
                return;
            }
            const themeParams = await this.getThemeParams();

            if (!themeParams?.length) {
                return;
            }

            this.state.templates = templatesParams;
            this.state.themes = themeParams;
        });
        // todo: implement this: useRecordObserver
        // useRecordObserver((record) => {
        //     if (record.data.mailing_model_id && this.wysiwyg) {
        //         this._hideIrrelevantTemplates(record);
        //     }
        // });
    }

    async getTemplatesParams() {
        // Filter the fetched templates based on the current model
        // todo: implement this.props.filterTemplates
        const args = this.props.filterTemplates
            ? [[["mailing_model_id", "=", this.props.mailingModelId]]]
            : [];

        // Templates taken from old mailings
        const favoritesTemplates = await this.orm.call(
            "mailing.mailing",
            "action_fetch_favorites",
            args
        );
        if (status(this) === "destroyed") {
            return;
        }
        return favoritesTemplates.map((templates) => {
            return {
                id: templates.id,
                modelId: templates.mailing_model_id[0],
                modelName: templates.mailing_model_id[1],
                name: `template_${templates.id}`,
                nowrap: true,
                subject: templates.subject,
                template: templates.body_arch,
                userId: templates.user_id[0],
                userName: templates.user_id[1],
            };
        });
    }
    async getThemeParams() {
        const themesHTML = await this.orm.call("ir.ui.view", "render_public_asset", [
            "mass_mailing.email_designer_themes",
        ]);
        if (status(this) === "destroyed") {
            return;
        }
        const themesEls = new DOMParser().parseFromString(themesHTML, "text/html").body.children;

        // Initialize theme parameters.
        const displayableThemes = uiUtils.isSmall()
            ? Array.from(themesEls).filter((theme) => !theme.dataset.hideFromMobile)
            : themesEls;
        return Array.from(displayableThemes).map((theme) => {
            const $theme = $(theme);
            const name = $theme.data("name");
            const classname = "o_" + name + "_theme";
            const imagesInfo = Object.assign(
                {
                    all: {},
                },
                $theme.data("imagesInfo") || {}
            );
            for (const [key, info] of Object.entries(imagesInfo)) {
                imagesInfo[key] = Object.assign(
                    {
                        module: "mass_mailing",
                        format: "jpg",
                    },
                    imagesInfo.all,
                    info
                );
            }
            return {
                name: name,
                title: $theme.attr("title") || "",
                className: classname || "",
                img: $theme.data("img") || "",
                template: $theme.html().trim(),
                nowrap: !!$theme.data("nowrap"),
                get_image_info: function (filename) {
                    if (imagesInfo[filename]) {
                        return imagesInfo[filename];
                    }
                    return imagesInfo.all;
                },
                layoutStyles: $theme.data("layout-styles"),
            };
        });
    }
    /**
     * @param {TemplateInfos} templateInfos
     */
    async selectTemplate(templateInfos) {
        this.props.onSelectMassMailingTemplate(
            templateInfos,
            await this.getTemplateHTML(templateInfos)
        );
    }
    /**
     * @param {TemplateInfos} templateInfos
     */
    async getTemplateHTML(templateInfos) {
        let $newWrapper;
        let $newWrapperContent;
        if (templateInfos.nowrap) {
            $newWrapper = $("<div/>", {
                class: "oe_structure",
            });
            $newWrapperContent = $newWrapper;
        } else {
            // This wrapper structure is the only way to have a responsive
            // and centered fixed-width content column on all mail clients
            $newWrapper = $("<div/>", {
                class: "container o_mail_wrapper o_mail_regular oe_unremovable",
            });
            $newWrapperContent = $("<div/>", {
                class: "col o_mail_no_options o_mail_wrapper_td bg-white oe_structure o_editable",
            });
            $newWrapper.append($('<div class="row"/>').append($newWrapperContent));
        }
        const $newLayout = $("<div/>", {
            class: "o_layout oe_unremovable oe_unmovable bg-200 " + templateInfos.className,
            style: templateInfos.layoutStyles,
            "data-name": "Mailing",
        }).append($newWrapper);

        const $contents = templateInfos.template;
        $newWrapperContent.append($contents);
        this.switchImages(templateInfos, $newWrapperContent);
        initializeDesignTabCss($newLayout);

        return $newLayout[0].outerHTML;
    }

    /**
     * Swap the previous theme's default images with the new ones.
     * (Redefine the `src` attribute of all images in a $container, depending on the theme parameters.)
     *
     * @private
     * @param {TemplateInfos} templateInfos
     * @param {JQuery} $container
     */
    switchImages(templateInfos, $container) {
        if (!templateInfos) {
            return;
        }
        for (const img of $container.find("img")) {
            const $img = $(img);
            const src = $img.attr("src");
            $img.removeAttr("loading");

            let m = src.match(/^\/web\/image\/\w+\.s_default_image_(?:theme_[a-z]+_)?(.+)$/);
            if (!m) {
                m = src.match(
                    /^\/\w+\/static\/src\/img\/(?:theme_[a-z]+\/)?s_default_image_(.+)\.[a-z]+$/
                );
            }
            if (!m) {
                return;
            }

            if (templateInfos.get_image_info) {
                const file = m[1];
                const imgInfo = templateInfos.get_image_info(file);

                const src = imgInfo.format
                    ? `/${imgInfo.module}/static/src/img/theme_${templateInfos.name}/s_default_image_${file}.${imgInfo.format}`
                    : `/web/image/${imgInfo.module}.s_default_image_theme_${templateInfos.name}_${file}`;

                $img.attr("src", src);
            }
        }
    }
}
