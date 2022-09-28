/** @odoo-module **/

import { registry } from '@web/core/registry';
import { getWysiwygClass } from 'web_editor.loader';

import { FullscreenIndication } from '../components/fullscreen_indication/fullscreen_indication';
import { WebsiteLoader } from '../components/website_loader/website_loader';

const { reactive, EventBus } = owl;

export const unslugHtmlDataObject = (repr) => {
    const match = repr && repr.match(/(.+)\((\d+),(.*)\)/);
    if (!match) {
        return null;
    }
    return {
        model: match[1],
        id: match[2] | 0,
    };
};

const ANONYMOUS_PROCESS_ID = 'ANONYMOUS_PROCESS_ID';

export const websiteService = {
    dependencies: ['orm', 'action', 'user', 'hotkey'],
    start(env, { orm, action, user, hotkey }) {
        let websites = [];
        let fullscreen;
        let pageDocument;
        let contentWindow;
        let lastUrl;
        let websiteRootInstance;
        let Wysiwyg;
        let isRestrictedEditor;
        let isDesigner;
        let hasMultiWebsites;
        let actionJsId;
        let blockingProcesses = [];
        let modelNamesProm = null;
        const modelNames = {};
        let invalidateSnippetCache = false;
        let lastWebsiteId = null;

        const initialContext = {
            showNewContentModal: false,
            showAceEditor: false,
            edition: false,
            isPublicRootReady: false,
            snippetsLoaded: false,
            isMobile: false,
        };
        const context = reactive({ ...initialContext });
        const websiteDef = {
            id: null,
            domain: null,
            metadata: {},
            name: null,
            reloadUrl: '',
        };
        const currentWebsite = reactive({ ...websiteDef });
        const bus = new EventBus();

        hotkey.add("escape", () => {
            // Toggle fullscreen mode when pressing escape.
            if (!currentWebsite.id && !fullscreen) {
                // Only allow to use this feature while on the website app, or
                // while it is already fullscreen (in case you left the website
                // app in fullscreen mode, thanks to CTRL-K).
                return;
            }
            fullscreen = !fullscreen;
            document.body.classList.toggle('o_website_fullscreen', fullscreen);
            bus.trigger(fullscreen ? 'FULLSCREEN-INDICATION-SHOW' : 'FULLSCREEN-INDICATION-HIDE');
        }, { global: true });
        registry.category('main_components').add('FullscreenIndication', {
            Component: FullscreenIndication,
            props: { bus },
        });
        registry.category('main_components').add('WebsiteLoader', {
            Component: WebsiteLoader,
            props: { bus },
        });
        return {
            /**
             * A setter is kept to fill the domain and name of the current
             * website based on its id.
             */
            set currentWebsiteId(id) {
                currentWebsite.id = id;
                if (websites.length) {
                    const website = websites.find(w => w.id === id);
                    currentWebsite.name = website.name;
                    currentWebsite.domain = website.domain;
                }
                if (id !== lastWebsiteId) {
                    invalidateSnippetCache = true;
                    lastWebsiteId = id;
                }
            },
            /**
             * This represents the current website being edited in the
             * WebsitePreview client action. Multiple components based their
             * visibility on this value, which is falsy if the client action is
             * not displayed.
             */
            get currentWebsite() {
                return currentWebsite;
            },
            get websites() {
                return websites;
            },
            get context() {
                return context;
            },
            get bus() {
                return bus;
            },
            set pageDocument(document) {
                pageDocument = document;
                if (!document) {
                    Object.assign(currentWebsite, websiteDef);
                    contentWindow = null;
                    return;
                }
                const { dataset } = document.documentElement;
                // XML files have no dataset on Firefox, and an empty one on
                // Chrome.
                const isWebsitePage = dataset && dataset.websiteId;
                if (!isWebsitePage) {
                    currentWebsite.metadata = {};
                } else {
                    const { mainObject, seoObject, isPublished, canPublish, editableInBackend, translatable, viewXmlid, websiteId } = dataset;
                    this.currentWebsiteId = parseInt(websiteId, 10);
                    const contentMenus = [...document.querySelectorAll('[data-content_menu_id]')].map(menu => [
                        menu.dataset.menu_name,
                        menu.dataset.content_menu_id,
                    ]);
                    currentWebsite.metadata = {
                        path: document.location.href,
                        mainObject: unslugHtmlDataObject(mainObject),
                        seoObject: unslugHtmlDataObject(seoObject),
                        isPublished: isPublished === 'True',
                        canPublish: canPublish === 'True',
                        editableInBackend: editableInBackend === 'True',
                        title: document.title,
                        translatable: !!translatable,
                        contentMenus,
                        // TODO: Find a better way to figure out if
                        // a page is editable or not. For now, we use
                        // the editable selector because it's the common
                        // denominator of editable pages.
                        editable: !!document.getElementById('wrapwrap'),
                        viewXmlid: viewXmlid,
                        lang: document.documentElement.getAttribute('lang').replace('-', '_'),
                        direction: document.documentElement.querySelector('#wrapwrap.o_rtl') ? 'rtl' : 'ltr',
                    };
                }
                contentWindow = document.defaultView;
            },
            get pageDocument() {
                return pageDocument;
            },
            get contentWindow() {
                return contentWindow;
            },
            get websiteRootInstance() {
                return websiteRootInstance;
            },
            set websiteRootInstance(rootInstance) {
                websiteRootInstance = rootInstance;
                context.isPublicRootReady = !!rootInstance;
            },
            set lastUrl(url) {
                lastUrl = url;
            },
            get lastUrl() {
                return lastUrl;
            },
            get isRestrictedEditor() {
                return isRestrictedEditor === true;
            },
            get isDesigner() {
                return isDesigner === true;
            },
            get hasMultiWebsites() {
                return hasMultiWebsites === true;
            },
            get actionJsId() {
                return actionJsId;
            },
            set actionJsId(jsId) {
                actionJsId = jsId;
            },
            get invalidateSnippetCache() {
                return invalidateSnippetCache;
            },
            set invalidateSnippetCache(value) {
                invalidateSnippetCache = value;
            },

            goToWebsite({ websiteId, path, edition, translation, lang } = {}) {
                let finalPath = path || (contentWindow && contentWindow.location.href) || '/';
                if (lang) {
                    invalidateSnippetCache = true;
                    finalPath = `/website/lang/${lang}?r=${encodeURIComponent(finalPath)}`;
                }
                if (!currentWebsite.id) {
                    action.doAction('website.website_preview', {
                        clearBreadcrumbs: true,
                        additionalContext: {
                            params: {
                                website_id: websiteId,
                                path: finalPath,
                                enable_editor: edition,
                                edit_translations: translation,
                            },
                        },
                    });
                } else {
                    if (websiteId) {
                        this.currentWebsiteId = websiteId;
                    }
                    currentWebsite.reloadUrl = finalPath;
                    Object.assign(context, initialContext);
                    context.edition = edition;
                    context.translation = translation;
                }
            },
            async fetchUserGroups() {
                // Fetch user groups, before fetching the websites.
                [isRestrictedEditor, isDesigner, hasMultiWebsites] = await Promise.all([
                    user.hasGroup('website.group_website_restricted_editor'),
                    user.hasGroup('website.group_website_designer'),
                    user.hasGroup('website.group_multi_website'),
                ]);
            },
            async fetchWebsites() {
                websites = [...(await orm.searchRead('website', [], ['domain', 'id', 'name']))];
            },
            async loadWysiwyg() {
                if (!Wysiwyg) {
                    Wysiwyg = await getWysiwygClass({
                        moduleName: 'website.wysiwyg',
                        additionnalAssets: ['website.assets_wysiwyg']
                    });
                }
                return Wysiwyg;
            },
            blockPreview(showLoader, processId) {
                if (!blockingProcesses.length) {
                    bus.trigger('BLOCK', { showLoader });
                }
                blockingProcesses.push(processId || ANONYMOUS_PROCESS_ID);
            },
            unblockPreview(processId) {
                const processIndex = blockingProcesses.indexOf(processId || ANONYMOUS_PROCESS_ID);
                if (processIndex > -1) {
                    blockingProcesses.splice(processIndex, 1);
                    if (blockingProcesses.length === 0) {
                        bus.trigger('UNBLOCK');
                    }
                }
            },
            showLoader(props) {
                bus.trigger('SHOW-WEBSITE-LOADER', props);
            },
            hideLoader() {
                bus.trigger('HIDE-WEBSITE-LOADER');
            },
            /**
             * Returns the (translated) "functional" name of a model
             * (_description) given its "technical" name (_name).
             *
             * @param {string} [model]
             * @returns {string}
             */
            async getUserModelName(model = this.currentWebsite.metadata.mainObject.model) {
                if (!modelNamesProm) {
                    // FIXME the `get_available_models` is to be removed/changed
                    // in a near future. This code is to be adapted, probably
                    // with another helper to map a model functional name from
                    // its technical map without the need of the right access
                    // rights (which is why I cannot use search_read here).
                    modelNamesProm = orm.call("ir.model", "get_available_models")
                        .then(modelsData => {
                            for (const modelData of modelsData) {
                                modelNames[modelData['model']] = modelData['display_name'];
                            }
                        })
                        // Precaution in case the util is simply removed without
                        // adapting this method: not critical, we can restore
                        // later and use the fallback until the fix is made.
                        .catch(() => {});
                }
                await modelNamesProm;
                return modelNames[model] || env._t("Data");
            },
        };
    },
};

registry.category('services').add('website', websiteService);
