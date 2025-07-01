import { MODULE_STATUS, NewContentElement } from "./new_content_element";
import { InstallModuleDialog } from "./install_module_dialog";
import { Component, onWillStart, useState, xml } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { redirect } from "@web/core/utils/urls";

export class NewContentSystrayItem extends Component {
    static template = "website.NewContentSystrayItem";
    static components = { NewContentElement };
    static props = {
        onNewPage: Function,
    };

    setup() {
        this.orm = useService("orm");
        this.dialogs = useService("dialog");
        this.website = useService("website");
        this.action = useService("action");
        this.isSystem = user.isSystem;
        this.state = useState({
            newContentElements: [
                {
                    moduleName: "website_blog",
                    moduleXmlId: "base.module_website_blog",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_blog/static/description/icon.png"/>`,
                    title: _t("Blog Post"),
                    subtitle: _t("Create a new article"),
                },
                {
                    moduleName: "website_event",
                    moduleXmlId: "base.module_website_event",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_event/static/description/icon.png"/>`,
                    title: _t("Event"),
                    subtitle: _t("Create a new event"),
                },
                {
                    moduleName: "website_forum",
                    moduleXmlId: "base.module_website_forum",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_forum/static/description/icon.png"/>`,
                    redirectUrl: "/forum",
                    title: _t("Forum"),
                    subtitle: _t("Create a new forum"),
                },
                {
                    moduleName: "website_hr_recruitment",
                    moduleXmlId: "base.module_website_hr_recruitment",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_hr_recruitment/static/description/icon.png"/>`,
                    title: _t("Job Position"),
                    subtitle: _t("Showcase job offers"),
                },
                {
                    moduleName: "website_sale",
                    moduleXmlId: "base.module_website_sale",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_sale/static/description/icon.png"/>`,
                    title: _t("Product"),
                    subtitle: _t("Create a new product"),
                },
                {
                    moduleName: "website_slides",
                    moduleXmlId: "base.module_website_slides",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_slides/static/description/icon.png"/>`,
                    title: _t("Course"),
                    subtitle: _t("Create a new course"),
                },
                {
                    moduleName: "website_livechat",
                    moduleXmlId: "base.module_website_livechat",
                    status: MODULE_STATUS.NOT_INSTALLED,
                    icon: xml`<img src="/website_livechat/static/description/icon.png"/>`,
                    title: _t("Livechat Widget"),
                    subtitle: _t("Allow customers to reach you"),
                },
            ],
        });
        this.websiteContext = useState(this.website.context);
        onWillStart(this.onWillStart.bind(this));
        this.newContentText = {
            failed: _t('Failed to install "%s"'),
            installInProgress: _t("The installation of an App is already in progress."),
            installNeeded: _t('Do you want to install the "%s" App?'),
            installPleaseWait: _t('Installing "%s"'),
        };
    }

    async onWillStart() {
        this.isDesigner = await user.hasGroup("website.group_website_designer");
        this.canInstall = await user.isAdmin;
        if (this.canInstall) {
            const moduleNames = this.state.newContentElements
                .filter(({ status }) => status === MODULE_STATUS.NOT_INSTALLED)
                .map(({ moduleName }) => moduleName);
            this.modulesInfo = {};
            for (const record of await this.orm.searchRead(
                "ir.module.module",
                [["name", "in", moduleNames]],
                ["id", "name", "shortdesc"]
            )) {
                this.modulesInfo[record.name] = { id: record.id, name: record.shortdesc };
            }
        }
        const modelsToCheck = [];
        const elementsToUpdate = {};
        for (const element of this.state.newContentElements) {
            if (element.model) {
                modelsToCheck.push(element.model);
                elementsToUpdate[element.model] = element;
            }
        }
        const accesses = await rpc("/website/check_new_content_access_rights", {
            models: modelsToCheck,
        });
        for (const [model, access] of Object.entries(accesses)) {
            elementsToUpdate[model].isDisplayed = access;
        }
    }

    get sortedNewContentElements() {
        return this.state.newContentElements
            .filter(({ status }) => status !== MODULE_STATUS.NOT_INSTALLED)
            .concat(
                this.state.newContentElements.filter(
                    ({ status }) => status === MODULE_STATUS.NOT_INSTALLED
                )
            );
    }

    async installModule(id, redirectUrl) {
        await this.orm.silent.call("ir.module.module", "button_immediate_install", [id]);
        if (redirectUrl) {
            this.website.prepareOutLoader();
            window.location.replace(redirectUrl);
        } else {
            const {
                id,
                metadata: { path, viewXmlid },
            } = this.website.currentWebsite;
            const url = new URL(path);
            if (viewXmlid === "website.page_404") {
                url.pathname = "";
            }
            this.website.prepareOutLoader();
            redirect(
                `/odoo/action-website.website_preview?website_id=${id}&path=${encodeURIComponent(
                    url.toString()
                )}&display_new_content=true`
            );
        }
    }

    onClickNewContent(element) {
        if (element.createNewContent) {
            return element.createNewContent();
        }
        const { id, name } = this.modulesInfo[element.moduleName];
        const dialogProps = {
            title: element.title,
            installationText: sprintf(this.newContentText.installNeeded, name),
            installModule: async () => {
                this.state.newContentElements = this.state.newContentElements.map((el) => {
                    if (el.moduleXmlId === element.moduleXmlId) {
                        el.status = MODULE_STATUS.INSTALLING;
                        el.icon = xml`<i class="fa fa-spin fa-circle-o-notch"/>`;
                        el.title = sprintf(this.newContentText.installPleaseWait, name);
                    }
                    return el;
                });
                this.website.showLoader({ title: _t("Building your %s", name) });
                try {
                    await this.installModule(id, element.redirectUrl);
                } catch (error) {
                    this.website.hideLoader();
                    this.state.newContentElements = this.state.newContentElements.map((el) => {
                        if (el.moduleXmlId === element.moduleXmlId) {
                            el.status = MODULE_STATUS.FAILED_TO_INSTALL;
                            el.icon = xml`<i class="fa fa-exclamation-triangle"/>`;
                            el.title = sprintf(this.newContentText.failed, name);
                        }
                        return el;
                    });
                    console.error(error);
                }
            },
        };
        this.dialogs.add(InstallModuleDialog, dialogProps);
    }

    async onAddContent(action, edition = false, context = null) {
        this.action.doAction(action, {
            additionalContext: context ? context : {},
            onClose: (infos) => {
                if (infos && !infos.dismiss) {
                    this.website.goToWebsite({ path: infos.path, edition: edition });
                    this.websiteContext.showNewContentModal = false;
                }
            },
            props: {
                onSave: (record, params) => {
                    if (record.resId) {
                        const path = params.computePath();
                        this.action.doAction({
                            type: "ir.actions.act_window_close",
                            infos: { path },
                        });
                    }
                },
            },
        });
    }
}
