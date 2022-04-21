/** @odoo-module **/

import { registry } from '@web/core/registry';
import core from 'web.core';
import ajax from 'web.ajax';
import { getWysiwygClass } from 'web_editor.loader';

const { reactive } = owl;

const websiteSystrayRegistry = registry.category('website_systray');

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

export const websiteService = {
    dependencies: ['orm', 'action'],
    async start(env, { orm, action }) {
        let websites = [];
        let currentWebsiteId;
        let currentMetadata = {};
        let pageDocument;
        let contentWindow;
        let editedObjectPath;
        let websiteRootInstance;
        let Wysiwyg;
        const context = reactive({
            showNewContentModal: false,
            edition: false,
            isPublicRootReady: false,
            snippetsLoaded: false,
        });

        const setCurrentWebsiteId = id => {
            currentWebsiteId = id;
            websiteSystrayRegistry.trigger('EDIT-WEBSITE');
        };
        return {
            set currentWebsiteId(id) {
                setCurrentWebsiteId(id);
            },
            get currentWebsite() {
                const currentWebsite = websites.find(w => w.id === currentWebsiteId);
                if (currentWebsite) {
                    currentWebsite.metadata = currentMetadata;
                }
                return currentWebsite;
            },
            get websites() {
                return websites;
            },
            get context() {
                return context;
            },
            set pageDocument(document) {
                pageDocument = document;
                const { mainObject, seoObject, isPublished, canPublish, editableInBackend } = document.documentElement.dataset;
                currentMetadata = {
                    path: document.location.href,
                    mainObject: unslugHtmlDataObject(mainObject),
                    seoObject: unslugHtmlDataObject(seoObject),
                    isPublished: isPublished === 'True',
                    canPublish: canPublish === 'True',
                    editableInBackend: editableInBackend === 'True',
                    title: document.title,
                };
                websiteSystrayRegistry.trigger('CONTENT-UPDATED');
            },
            get pageDocument() {
                return pageDocument;
            },
            set contentWindow(window) {
                contentWindow = window;
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
            set editedObjectPath(path) {
                editedObjectPath = path;
            },
            get editedObjectPath() {
                return editedObjectPath;
            },
            get wysiwygLoaded() {
                return !!Wysiwyg;
            },
            goToWebsite({ websiteId, path } = {}) {
                action.doAction('website.website_preview', {
                    clearBreadcrumbs: true,
                    additionalContext: {
                        params: {
                            website_id: websiteId,
                            path,
                        },
                    },
                });
            },
            async fetchWebsites() {
                const [currentWebsiteRepr, allWebsites] = await Promise.all([
                    orm.call('website', 'get_current_website'),
                    orm.searchRead('website', []),
                ]);
                websites = [...allWebsites];
                setCurrentWebsiteId(unslugHtmlDataObject(currentWebsiteRepr).id);
            },
            async loadWysiwyg() {
                if (!Wysiwyg) {
                    await ajax.loadXML('/website/static/src/xml/website.editor.xml', core.qweb);
                    Wysiwyg = await getWysiwygClass({wysiwygAlias: 'website.wysiwyg'}, ['website.compiled_assets_wysiwyg']);
                }
                return Wysiwyg;
            }
        };
    },
};

registry.category('services').add('website', websiteService);
