/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { AddPageDialog } from "../components/dialog/add_page_dialog";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useService } from '@web/core/utils/hooks';
import { Component, useState, useEffect } from "@odoo/owl";

class EditWebsiteSystray extends Component {
    static template = "website.EditWebsiteSystray";
    static components = {
        Dropdown,
        DropdownItem,
    };
    static props = {};
    setup() {
        this.websiteService = useService('website');
        this.dialogService = useService("dialog");
        this.websiteContext = useState(this.websiteService.context);

        this.state = useState({
            isLoading: false,
        });

        useEffect((edition) => {
            if (edition) {
                this.state.isLoading = true;
            }
        }, () => [this.websiteContext.edition]);

        useEffect((snippetsLoaded) => {
            if (snippetsLoaded) {
                this.state.isLoading = false;
            }
        }, () => [this.websiteContext.snippetsLoaded]);
    }

    get translatable() {
        return this.websiteService.currentWebsite && this.websiteService.currentWebsite.metadata.translatable;
    }

    get label() {
        return _t("Edit");
    }

    attemptStartTranslate() {
        if (this.websiteService.isRestrictedEditor && !this.websiteService.isDesigner) {
            if (!this.websiteService.websiteRootInstance) {
                // Root instance might not be there yet if user clicks too fast.
                // Let's have him click again rather than apply different rules.
                return;
            }
            const object = this.websiteService.currentWebsite.metadata.mainObject;
            const objects = {
                [object.model]: object.id,
            };
            const otherRecordEls = this.websiteService.websiteRootInstance.el.querySelectorAll(
                "[data-res-model][data-res-id]:not([data-res-model='ir.ui.view']), [data-oe-model][data-oe-id]:not([data-oe-model='ir.ui.view'])"
            );
            for (const el of otherRecordEls) {
                const model = el.dataset.resModel || el.dataset.oeModel;
                if (!objects[model]) {
                    // Keep one record of each type.
                    objects[model] = parseInt(el.dataset.resId || el.dataset.oeId);
                }
            }
            rpc('/website/check_can_modify_any', {
                records: Object.entries(objects).map((kv) => {
                    return {
                        res_model: kv[0],
                        res_id: kv[1],
                    };
                }),
            }).then(() => {
                this.startTranslate();
            });
        } else {
            this.startTranslate();
        }
    }

    startTranslate() {
        const { pathname, search, hash } = this.websiteService.contentWindow.location;
        if (!search.includes('edit_translations')) {
            const searchParams = new URLSearchParams(search);
            searchParams.set('edit_translations', '1');
            this.websiteService.goToWebsite({
                path: pathname + `?${searchParams.toString() + hash}`,
                translation: true
            });
        } else {
            this.websiteContext.translation = true;
        }
    }

    startEdit() {
        if (this.translatable) {
            // We are in translate mode, the pathname starts with '/<url_code>'. By
            // adding a trailing slash we can simply search for the first slash
            // after the language code to remove the language part.
            const { pathname, search, hash } = this.websiteService.contentWindow.location;
            const languagePrefix = `${pathname}/`.indexOf('/', 1);
            const defaultLanguagePathname = pathname.substring(languagePrefix);
            this.websiteService.goToWebsite({
                path: defaultLanguagePathname + search + hash,
                lang: 'default',
                edition: true
            });
        } else {
            this.websiteContext.edition = true;
        }
    }

    async createPage() {
        this.dialogService.add(AddPageDialog, {
            websiteId: this.websiteService.currentWebsite.id,
        });
    }
}

export const systrayItem = {
    Component: EditWebsiteSystray,
    isDisplayed: (env) => env.services.website.currentWebsite.metadata.editable || env.services.website.currentWebsite.metadata.translatable,
};

registry.category("website_systray").add("EditWebsite", systrayItem, { sequence: 7 });
