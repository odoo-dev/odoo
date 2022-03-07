/** @odoo-module **/

import { NavBar } from '@web/webclient/navbar/navbar';
import { useService, useBus } from '@web/core/utils/hooks';
import { registry } from "@web/core/registry";
import { patch } from 'web.utils';
import { EditMenuDialog } from '@website/components/dialog/edit_menu';
import { OptimizeSEODialog } from '@website/components/dialog/seo';
import { standaloneAdapter } from 'web.OwlCompatibility';
import { FormViewDialog } from 'web.view_dialogs';
import { DeletePageDialog, DuplicatePageDialog } from '@website/components/dialog/page_properties';

const websiteSystrayRegistry = registry.category('website_systray');
const { Component } = owl;

patch(NavBar.prototype, 'website_navbar', {
    setup() {
        this._super();
        this.websiteService = useService('website');
        this.dialogService = useService('dialog');

        if (this.env.debug) {
            registry.category('website_systray').add('DebugMenu', registry.category('systray').get('web.debug_mode_menu'), { sequence: 100 });
        }

        useBus(websiteSystrayRegistry, 'EDIT-WEBSITE', () => this.render(true));
        useBus(websiteSystrayRegistry, 'CONTENT-UPDATED', () => this.render(true));

        this.websiteDialogMenus = {
            'website.menu_edit_menu': {
                component: EditMenuDialog,
                isDisplayed: () => !!this.websiteService.currentWebsite,
            },
            'website.menu_page_properties': {
                openDialog: async (options) => {
                    const dialog = this.createDialog(options);
                    dialog.buttons = [...dialog.buttons, ...options.extraButtons];
                    dialog.open();
                },
                options: (parent, pageId) => ({
                    res_model: "website.page",
                    res_id: pageId,
                    context: {
                        form_view_ref: 'website.website_page_properties_view_form'
                    },
                    title: this.env._t("Page Properties"),
                    size: 'medium',
                    on_saved: (object) => this.websiteService.goToWebsite({ path: object.data.url }),
                    extraButtons: [{
                        text: this.env._t("Duplicate Page"),
                        icon: 'fa-clone',
                        classes: 'btn-link ml-auto',
                        click: function () {
                            parent.dialogService.add(DuplicatePageDialog, { pageId, onClose: this.close.bind(this) });
                        },
                    },
                    {
                        text: this.env._t("Delete Page"),
                        icon: 'fa-trash',
                        classes: 'btn-link',
                        click: function () {
                            parent.dialogService.add(DeletePageDialog, { pageId, onClose: this.close.bind(this) });
                        },
                    }],
                }),
                isDisplayed: () => this.websiteService.currentWebsite && !!this.websiteService.currentWebsite.metadata.mainObject
                && this.websiteService.currentWebsite.metadata.mainObject.model === 'website.page',
            },
            'website.menu_optimize_seo': {
                component: OptimizeSEODialog,
                isDisplayed: () => this.websiteService.currentWebsite && !!this.websiteService.currentWebsite.metadata.mainObject,
            },
        };
    },

    filterWebsiteMenus(sections) {
        const filteredSections = [];
        for (const section of sections) {
            if (!this.websiteDialogMenus[section.xmlid] || this.websiteDialogMenus[section.xmlid].isDisplayed()) {
                let subSections = [];
                if (section.childrenTree.length) {
                    subSections = this.filterWebsiteMenus(section.childrenTree);
                }
                filteredSections.push(Object.assign({}, section, {childrenTree: subSections}));
            }
        }
        return filteredSections;
    },

    /**
     * @override
     */
    getSystrayItems() {
        if (this.websiteService.currentWebsite) {
            return websiteSystrayRegistry
                .getEntries()
                .map(([key, value]) => ({ key, ...value }))
                .filter((item) => ('isDisplayed' in item ? item.isDisplayed(this.env) : true))
                .reverse();
        }
        return this._super();
    },

    /**
     * @override
     */
    getCurrentAppSections() {
        const currentAppSections = this._super();
        if (this.currentApp && this.currentApp.xmlid === 'website.menu_website_configuration') {
            return this.filterWebsiteMenus(currentAppSections);
        }
        return currentAppSections;
    },

    /**
     * @overrid
     */
    onNavBarDropdownItemSelection(menu) {
        const dialogMenu = this.websiteDialogMenus[menu.xmlid];
        if (dialogMenu) {
            return dialogMenu.openDialog ?
            dialogMenu.openDialog(dialogMenu.options(this, this.websiteService.currentWebsite.metadata.mainObject.id)) :
            this.dialogService.add(dialogMenu.component);
        }
        return this._super(menu);
    },

    createDialog(options) {
        return new FormViewDialog(standaloneAdapter({ Component }), options);
    },
});
