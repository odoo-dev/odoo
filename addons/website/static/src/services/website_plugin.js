import { computed, EventBus, onWillDestroy, Plugin, signal, usePlugin } from "@odoo/owl";
import { HotkeyPlugin } from "@web/core/hotkeys/hotkey_plugin";
import { jsToPyLocale } from "@web/core/l10n/utils";
import { _t } from "@web/core/l10n/translation";
import { ORM } from "@web/core/orm_plugin";
import { registry } from "@web/core/registry";
import { services } from "@web/core/services";
import { user } from "@web/core/user";
import { isVisible } from "@web/core/utils/ui";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

import { FullscreenIndication } from "../components/fullscreen_indication/fullscreen_indication";
import { WebsiteLoader } from "../components/website_loader/website_loader";

const websiteSystrayRegistry = registry.category("website_systray");

// TODO this is duplicated in website_root at least, it should be a shared util
export const unslugHtmlDataObject = (repr) => {
    const match = repr && repr.match(/(.+)\((-?\d+),(.*)\)/);
    if (!match) {
        return null;
    }
    return {
        model: match[1],
        id: match[2] | 0,
    };
};

const ANONYMOUS_PROCESS_ID = "ANONYMOUS_PROCESS_ID";

export class WebsitePlugin extends Plugin {
    /** @private */
    orm = usePlugin(ORM);
    /** @private */
    action = usePlugin(ActionPlugin);
    /** @private */
    hotkey = usePlugin(HotkeyPlugin);

    websites = signal([]);
    /**
     * This represents the id of the current website being edited in the
     * WebsitePreview client action.
     */
    currentWebsiteId = signal(undefined);
    pageDocument = signal(undefined);
    contentWindow = signal(undefined);
    websiteRootInstance = signal(undefined);
    lastUrl = signal(undefined);
    isRestrictedEditor = signal(false);
    isDesigner = signal(false);
    hasMultiWebsites = signal(false);
    actionJsId = signal(undefined);
    invalidateSnippetCache = signal(false);
    isNavigatingToAnotherPage = signal(null);

    // Website preview context
    showResourceEditor = signal(false);
    edition = signal(false);
    isPublicRootReady = computed(() => !!this.websiteRootInstance());
    snippetsLoaded = signal(false);
    isMobile = signal(false);

    bus = new EventBus();

    /** @private */
    currentWebsiteIdList = [];
    /** @private */
    currentMetadata = signal({});
    /** @private */
    fullscreen = false;
    /** @private */
    blockingProcesses = [];
    /** @private */
    modelNamesProm = null;
    /** @private */
    modelNames = {};
    /** @private */
    lastWebsiteId = null;

    /**
     * This represents the current website being edited in the WebsitePreview
     * client action. Multiple components based their visibility on this value,
     * which is falsy if the client action is not displayed.
     */
    currentWebsite = computed(() => {
        const currentWebsite = this.websites().find((w) => w.id === this.currentWebsiteId());
        if (currentWebsite) {
            currentWebsite.metadata = this.currentMetadata();
        }
        return currentWebsite;
    });

    is404 = computed(() => this.currentMetadata().viewXmlid === "website.page_404");

    hasEditableRecordInBackend = computed(() => {
        const currentWebsite = this.currentWebsite();
        return (
            currentWebsite &&
            currentWebsite.metadata.editableInBackend &&
            // TODO the functional desire is to have read access on all
            // "website" models for all internal users, but there are many
            // fields preventing that... to review in master (should views just
            // be smarter? should they be more basic in the website app?). This
            // disables the form view access feature for some models that are
            // known to lead to access rights lock. At least, list views are
            // accessible at the moment.
            // See WEBSITE_RECORDS_VIEWS_ACCESS_RIGHTS.
            (!currentWebsite.metadata.mainObject ||
                !["event.event", "hr.job"].includes(currentWebsite.metadata.mainObject.model) ||
                currentWebsite.metadata.canPublish)
        );
    });

    setup() {
        const removeHotkey = this.hotkey.add("escape", () => this.toggleFullscreen(), {
            global: true,
        });
        onWillDestroy(removeHotkey);
        registry.category("main_components").add("FullscreenIndication", {
            Component: FullscreenIndication,
            props: { bus: this.bus },
        });
        registry.category("main_components").add("WebsiteLoader", {
            Component: WebsiteLoader,
            props: { bus: this.bus },
        });
    }

    /** @private */
    toggleFullscreen() {
        // Toggle fullscreen mode when pressing escape.
        const pageDocument = this.pageDocument();
        if (
            (!this.currentWebsiteId() && !this.fullscreen) ||
            (pageDocument && isVisible(pageDocument.querySelector(".modal")))
        ) {
            // Only allow to use this feature while on the website app, or
            // while it is already fullscreen (in case you left the website
            // app in fullscreen mode, thanks to CTRL-K), or if a modal
            // is open within the preview and could be closed with escape.
            return;
        }
        this.fullscreen = !this.fullscreen;
        document.body.classList.toggle("o_website_fullscreen", this.fullscreen);
        this.bus.trigger(
            this.fullscreen ? "FULLSCREEN-INDICATION-SHOW" : "FULLSCREEN-INDICATION-HIDE"
        );
    }

    /** @private */
    addWebsiteId(id) {
        if (!this.currentWebsiteIdList.length) {
            this.currentWebsiteId.set(id);
        }
        this.currentWebsiteIdList.push(id);
    }

    /** @private */
    removeWebsiteId() {
        this.currentWebsiteIdList.shift();
        if (this.currentWebsiteIdList.length) {
            this.currentWebsiteId.set(this.currentWebsiteIdList[0]);
        } else {
            this.currentWebsiteId.set(null);
        }
    }

    /**
     * @param {number|null} id the id of the website displayed by a new
     *  WebsitePreview client action, or null when that client action is left.
     */
    setCurrentWebsiteId(id) {
        if (id === null) {
            this.removeWebsiteId();
            return;
        }
        if (id && id !== this.lastWebsiteId) {
            this.invalidateSnippetCache.set(true);
            this.lastWebsiteId = id;
        }
        this.addWebsiteId(id);
        websiteSystrayRegistry.trigger("EDIT-WEBSITE");
    }

    /**
     * @param {Document} [document] the document displayed in the website
     *  preview iframe
     */
    setPageDocument(document) {
        this.pageDocument.set(document);
        if (!document) {
            this.currentMetadata.set({});
            this.contentWindow.set(null);
            return;
        }
        const { dataset } = document.documentElement;
        // XML files have no dataset on Firefox, and an empty one on
        // Chrome.
        const isWebsitePage = dataset && dataset.websiteId;
        if (!isWebsitePage) {
            this.currentMetadata.set({});
        } else {
            const {
                mainObject,
                seoObject,
                isPublished,
                publishOn,
                canOptimizeSeo,
                canPublish,
                editableInBackend,
                translatable,
                viewXmlid,
                defaultLangName,
                langName,
            } = dataset;
            // We ignore multiple menus with the same `content_menu_id`
            // in the DOM, since it's possible to have different
            // templates for the same content menu (E.g. used for a
            // different desktop / mobile UI).
            const contentMenus = [
                ...new Map(
                    [...document.querySelectorAll("[data-content_menu_id]")].map((menuEl) => [
                        menuEl.dataset.content_menu_id,
                        [menuEl.dataset.menu_name, menuEl.dataset.content_menu_id],
                    ])
                ).values(),
            ];
            this.currentMetadata.set({
                path: document.location.href,
                mainObject: unslugHtmlDataObject(mainObject),
                seoObject: unslugHtmlDataObject(seoObject),
                isPublished: isPublished === "True",
                publishOn: publishOn || false,
                canOptimizeSeo: canOptimizeSeo === "True",
                canPublish: canPublish === "True",
                editableInBackend: editableInBackend === "True",
                title: document.title,
                translatable: !!translatable,
                contentMenus,
                // TODO: Find a better way to figure out if
                // a page is editable or not. For now, we use
                // the editable selector because it's the common
                // denominator of editable pages.
                editable: !!document.getElementById("wrapwrap"),
                viewXmlid: viewXmlid,
                lang: jsToPyLocale(document.documentElement.getAttribute("lang")),
                defaultLangName: defaultLangName,
                langName: langName,
                direction: document.documentElement.querySelector("#wrapwrap.o_rtl")
                    ? "rtl"
                    : "ltr",
            });
        }
        this.contentWindow.set(document.defaultView);
        websiteSystrayRegistry.trigger("CONTENT-UPDATED");
    }

    /**
     * Not a computed: the location of the preview iframe is not reactive.
     *
     * @returns {string} the path of the page displayed in the website preview,
     *  without its language prefix
     */
    getCurrentLocation() {
        const path = decodeURIComponent(this.contentWindow().location.pathname);
        if (!this.currentWebsite().metadata.translatable) {
            return path;
        }
        // If the website is translatable, remove the /lang in the
        // location pathname, e.g. /fr/hello-page -> /hello-page
        const lang = path.split("/")[1];
        return path.slice(lang.length + 1);
    }

    async goToWebsite({ websiteId, path, edition, translation, lang } = {}) {
        this.websiteRootInstance.set(undefined);
        if (lang) {
            this.invalidateSnippetCache.set(true);
            path = `/website/lang/${encodeURIComponent(lang)}?r=${encodeURIComponent(path)}`;
        }
        const contentWindow = this.contentWindow();
        await this.action.doAction("website.website_preview", {
            clearBreadcrumbs: true,
            props: {
                websiteId: websiteId || this.currentWebsiteId() || false,
                path: path || (contentWindow && contentWindow.location.href) || "/",
                enableEditor: edition,
                editTranslations: translation,
            },
        });
    }

    async fetchUserGroups() {
        // Fetch user groups, before fetching the websites.
        const [isRestrictedEditor, isDesigner, hasMultiWebsites] = await Promise.all([
            user.hasGroup("website.group_website_restricted_editor"),
            user.hasGroup("website.group_website_designer"),
            user.hasGroup("website.group_multi_website"),
        ]);
        this.isRestrictedEditor.set(isRestrictedEditor === true);
        this.isDesigner.set(isDesigner === true);
        this.hasMultiWebsites.set(hasMultiWebsites === true);
    }

    async fetchWebsites() {
        const { records } = await this.orm.webSearchRead("website", [], {
            specification: {
                domain: {},
                id: {},
                name: {},
                language_ids: {},
                default_lang_id: { fields: { code: {} } },
                cookies_bar: {},
                company_id: {},
            },
        });
        this.websites.set(records);
    }

    blockPreview(showLoader, processId) {
        if (!this.blockingProcesses.length) {
            this.bus.trigger("BLOCK", { showLoader });
        }
        this.blockingProcesses.push(processId || ANONYMOUS_PROCESS_ID);
    }

    unblockPreview(processId) {
        const processIndex = this.blockingProcesses.indexOf(processId || ANONYMOUS_PROCESS_ID);
        if (processIndex > -1) {
            this.blockingProcesses.splice(processIndex, 1);
            if (this.blockingProcesses.length === 0) {
                this.bus.trigger("UNBLOCK");
            }
        }
    }

    /**
     * @param {Object} [props]
     * @param {string} [props.title]
     * @param {"colors"|"generic"|"images"|"text"} [props.flag]
     * @param {boolean} [props.showCloseButton=false]
     * @param {string} [props.bottomMessageTemplate]
     * @param {boolean} [props.showProgressBar=true]
     * @param {() => number} [props.getProgress]
     * @param {Array<Object>} [props.loadingSteps]
     * @param {string} [props.loadingSteps[].title]
     * @param {"colors"|"generic"|"images"|"text"} [props.loadingSteps[].flag]
     * @param {string} [props.loadingSteps[].description]
     * @param {boolean} [props.loadingSteps[].completed]
     */
    showLoader(props) {
        this.bus.trigger("SHOW-WEBSITE-LOADER", props);
    }

    /**
     * @param {Object} [props]
     * @param {boolean} [props.completeRemainingProgress=true]
     */
    hideLoader(props) {
        this.bus.trigger("HIDE-WEBSITE-LOADER", props);
    }

    /**
     * @param {Object} [props]
     * @param {boolean} [props.completeRemainingProgress=true]
     * @param {Function} [props.redirectAction]
     */
    redirectOutFromLoader(props) {
        this.bus.trigger("REDIRECT-OUT-FROM-WEBSITE-LOADER", props);
    }

    /**
     * Returns the (translated) "functional" name of a model
     * (_description) given its "technical" name (_name).
     *
     * @param {string} [model]
     * @returns {string}
     */
    async getUserModelName(model = this.currentWebsite().metadata.mainObject.model) {
        if (!this.modelNamesProm) {
            // FIXME the `get_available_models` is to be removed/changed
            // in a near future. This code is to be adapted, probably
            // with another helper to map a model functional name from
            // its technical map without the need of the right access
            // rights (which is why I cannot use search_read here).
            this.modelNamesProm = this.orm
                .call("ir.model", "get_available_models")
                .then((modelsData) => {
                    for (const modelData of modelsData) {
                        this.modelNames[modelData["model"]] = modelData["display_name"];
                    }
                })
                // Precaution in case the util is simply removed without
                // adapting this method: not critical, we can restore
                // later and use the fallback until the fix is made.
                .catch(() => {});
        }
        await this.modelNamesProm;
        return this.modelNames[model] || _t("Data");
    }
}

services.add(WebsitePlugin);

/**
 * -----------------------------------------------------------------------------
 * @todo owl3 migration
 * temporary - to remove when all use of the website service are removed
 * -----------------------------------------------------------------------------
 */
export const websiteService = {
    dependencies: ["orm", "action", "hotkey"],
    start() {
        const plugin = usePlugin(WebsitePlugin);
        const context = {
            get showResourceEditor() {
                return plugin.showResourceEditor();
            },
            set showResourceEditor(value) {
                plugin.showResourceEditor.set(value);
            },
            get edition() {
                return plugin.edition();
            },
            set edition(value) {
                plugin.edition.set(value);
            },
            get isPublicRootReady() {
                return plugin.isPublicRootReady();
            },
            get snippetsLoaded() {
                return plugin.snippetsLoaded();
            },
            set snippetsLoaded(value) {
                plugin.snippetsLoaded.set(value);
            },
            get isMobile() {
                return plugin.isMobile();
            },
            set isMobile(value) {
                plugin.isMobile.set(value);
            },
        };
        return {
            set currentWebsiteId(id) {
                plugin.setCurrentWebsiteId(id);
            },
            get currentWebsiteId() {
                return plugin.currentWebsiteId();
            },
            get currentWebsite() {
                return plugin.currentWebsite();
            },
            get websites() {
                return plugin.websites();
            },
            get context() {
                return context;
            },
            get bus() {
                return plugin.bus;
            },
            set pageDocument(document) {
                plugin.setPageDocument(document);
            },
            get pageDocument() {
                return plugin.pageDocument();
            },
            get contentWindow() {
                return plugin.contentWindow();
            },
            get websiteRootInstance() {
                return plugin.websiteRootInstance();
            },
            set websiteRootInstance(rootInstance) {
                plugin.websiteRootInstance.set(rootInstance);
            },
            set lastUrl(url) {
                plugin.lastUrl.set(url);
            },
            get lastUrl() {
                return plugin.lastUrl();
            },
            get isRestrictedEditor() {
                return plugin.isRestrictedEditor();
            },
            get isDesigner() {
                return plugin.isDesigner();
            },
            get is404() {
                return plugin.is404();
            },
            get currentLocation() {
                return plugin.getCurrentLocation();
            },
            get hasMultiWebsites() {
                return plugin.hasMultiWebsites();
            },
            get actionJsId() {
                return plugin.actionJsId();
            },
            set actionJsId(jsId) {
                plugin.actionJsId.set(jsId);
            },
            get invalidateSnippetCache() {
                return plugin.invalidateSnippetCache();
            },
            set invalidateSnippetCache(value) {
                plugin.invalidateSnippetCache.set(value);
            },
            set isNavigatingToAnotherPage(promise) {
                plugin.isNavigatingToAnotherPage.set(promise);
            },
            get isNavigatingToAnotherPage() {
                return plugin.isNavigatingToAnotherPage();
            },
            get hasEditableRecordInBackend() {
                return plugin.hasEditableRecordInBackend();
            },
            goToWebsite: plugin.goToWebsite.bind(plugin),
            fetchUserGroups: plugin.fetchUserGroups.bind(plugin),
            fetchWebsites: plugin.fetchWebsites.bind(plugin),
            blockPreview: plugin.blockPreview.bind(plugin),
            unblockPreview: plugin.unblockPreview.bind(plugin),
            showLoader: plugin.showLoader.bind(plugin),
            hideLoader: plugin.hideLoader.bind(plugin),
            redirectOutFromLoader: plugin.redirectOutFromLoader.bind(plugin),
            getUserModelName: plugin.getUserModelName.bind(plugin),
        };
    },
};

registry.category("services").add("website", websiteService);
