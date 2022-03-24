/** @odoo-module */

import { ComponentAdapter } from 'web.OwlCompatibility';
import { _t } from '@web/core/l10n/translation';

import { useWowlService } from '@web/legacy/utils';


const { onWillStart, useEffect } = owl;

export class PageOption {
    /***
     * A page option is defined with an input el hidden inside the content that we're editing.
     * @param {HTMLInputElement} el The element holding the value of the page option
     * @param {Document} document The document on which the option applies.
     * @param {Function} callback The method called after applying an option
     * @param isDirty If the option is dirty, it's value will be sent to the database
     */
    constructor(el, document, callback, isDirty = false) {
        this.el = el;
        this.isDirty = isDirty;
        this.document = document;
        this.callback = callback.bind(this);
    }
    get value() {
        if (this.el.value.toLowerCase() === 'true') {
            return true;
        } else if (this.el.value.toLowerCase() === 'false') {
            return false;
        }
        return this.el.value;
    }
    set value(value) {
        this.callback(value);
        this.el.value = value;
        this.isDirty = true;
    }
}
export const pageOptionsCallbacks = {
    header_overlay: function (value) {
        this.document.getElementById('wrapwrap').classList.toggle('o_header_overlay', value);
    },
    header_color: function (value) {
        const headerEl = this.document.querySelector('#wrapwrap > header');
        if (this.value) {
            headerEl.classList.remove(this.value);
        }
        if (value) {
            headerEl.classList.add(value);
        }
    },
    header_visible: function (value) {
        const headerEl = this.document.querySelector('#wrapwrap > header');
        headerEl.classList.toggle('d-none', !value);
        headerEl.classList.toggle('o_snippet_invisible', !value);
    },
    footer_visible: function (value) {
        this.document.querySelector('#wrapwrap > footer').toggleClass('d-none o_snippet_invisible', !value);
    },
};


export class WysiwygAdapterComponent extends ComponentAdapter {
    /**
     * @override
     */
    setup() {
        super.setup();
        const options = this.props.options || {};
        this.iframe = this.props.iframe;

        this.websiteService = useWowlService('website');
        this.userService = useWowlService('user');
        this.rpc = useWowlService('rpc');
        this.orm = useWowlService('orm');

        this.oeStructureSelector = '#wrapwrap .oe_structure[data-oe-xpath][data-oe-id]';
        this.oeFieldSelector = '#wrapwrap [data-oe-field]';
        this.oeCoverSelector = '#wrapwrap .s_cover[data-res-model], #wrapwrap .o_record_cover_container[data-res-model]';
        if (options.savableSelector) {
            this.savableSelector = options.savableSelector;
        } else {
            this.savableSelector = `${this.oeStructureSelector}, ${this.oeFieldSelector}, ${this.oeCoverSelector}`;
        }
        this.pageOptions = {};

        onWillStart(() => {
            const pageOptionEls = this.iframe.el.contentDocument.querySelectorAll('.o_page_option_data');
            for (const pageOptionEl of pageOptionEls) {
                const optionName = pageOptionEl.name;
                this.pageOptions[optionName] = new PageOption(pageOptionEl, this.iframe.el.contentDocument, pageOptionsCallbacks[optionName]);
            }
            this.editableFromEditorMenu(this.$editable).addClass('o_editable');
        });

        useEffect(() => {
            // useExternalListener only work on setup, but save button doesn't exist on setup
            this.$editable.on('click.odoo-website-editor', '*', this, this._preventDefault);
            // Disable OdooEditor observer's while setting up classes
            this.widget.odooEditor.observerUnactive();
            this._addEditorMessages();
            this.widget.odooEditor.observerActive();
            this._setObserver();

            if (this.props.target) {
                this.widget.snippetsMenu.activateSnippet($(this.props.target));
            }
            this.websiteService.toggleFullscreen();
            // Initializing Page Options

            if (!this.iframe.el.classList.contains('editor_enable')) {
                this.iframe.el.classList.add('editor_enable', 'editor_has_snippets');
            }
            return () => {
                this.$editable.off('click.odoo-website-editor', '*');
            };
        }, () => []);
    }
    /**
     * Stop the widgets and save the content.
     *
     * @returns {Promise} the save promise from the Wysiwyg widget.
     */
    async save() {
        const mainObject = this.websiteService.currentWebsite.metadata.mainObject;
        if (this.observer) {
            this.observer.disconnect();
            delete this.observer;
        }
        await this._websiteRootEvent('widgets_stop_request');
        const dirtyPageOptions = Object.entries(this.pageOptions).filter(([name, option]) => option.isDirty);
        const proms = [];
        for (const [name, option] of dirtyPageOptions) {
            proms.push(this.orm.write(mainObject.model, [mainObject.id], {[name]: option.value}));
        }
        await Promise.all(proms);
        return this.widget.saveContent(false);
    }
     /**
     * Returns the editable areas on the page.
     *
     * @param {DOM} $wrapwrap
     * @returns {jQuery}
     */
    editableFromEditorMenu($wrapwrap) {
        return $wrapwrap.find('[data-oe-model]')
            .not('.o_not_editable')
            .filter(function () {
                var $parent = $(this).closest('.o_editable, .o_not_editable');
                return !$parent.length || $parent.hasClass('o_editable');
            })
            .not('link, script')
            .not('[data-oe-readonly]')
            .not('img[data-oe-field="arch"], br[data-oe-field="arch"], input[data-oe-field="arch"]')
            .not('.oe_snippet_editor')
            .not('hr, br, input, textarea')
            .add('.o_editable');
    }
    /**
     * @override
     */
    get widgetArgs() {
        return [this._wysiwygParams];
    }

    get editable() {
        return this.iframe.el.contentDocument.getElementById('wrapwrap');
    }

    get $editable() {
        return $(this.editable);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    get _wysiwygParams() {
        const context = this.userService.context;
        return {
            snippets: 'website.snippets',
            recordInfo: {
                context: context,
                data_res_model: 'website',
                data_res_id: context.website_id,
            },
            editable: this.$editable,
            enableWebsite: true,
            discardButton: true,
            saveButton: true,
            devicePreview: true,
            savableSelector: this.savableSelector,
            isRootEditable: false,
            controlHistoryFromDocument: true,
            getContentEditableAreas: this._getContentEditableAreas.bind(this),
            document: this.iframe.el.contentDocument,
            sideAttach: true,
        };
    }
    /**
     * Sets the observer so that if any change happen to the body and such
     * changes should be saved, the class 'o_dirty' is added to elements
     * that were changed.
     */
    _setObserver() {
        // 1. Make sure every .o_not_editable is not editable.
        // 2. Observe changes to mark dirty structures and fields.
        const processRecords = (records) => {
            records = this.widget.odooEditor.filterMutationRecords(records);
            // Skip the step for this stack because if the editor undo the first
            // step that has a dirty element, the following code would have
            // generated a new stack and break the "redo" of the editor.
            this.widget.odooEditor.automaticStepSkipStack();
            for (const record of records) {
                const $savable = $(record.target).closest(this.savableSelector);

                if (record.attributeName === 'contenteditable') {
                    continue;
                }
                $savable.not('.o_dirty').each(function () {
                    const $el = $(this);
                    if (!$el.closest('[data-oe-readonly]').length) {
                        $el.addClass('o_dirty');
                    }
                });
            }
        };
        this.observer = new MutationObserver(processRecords);
        const observe = () => {
            if (this.observer) {
                this.observer.observe(this.iframe.el.contentDocument.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeOldValue: true,
                    characterData: true,
                });
            }
        };
        observe();

        this.widget.odooEditor.addEventListener('observerUnactive', () => {
            if (this.observer) {
                processRecords(this.observer.takeRecords());
                this.observer.disconnect();
            }
        });
        this.widget.odooEditor.addEventListener('observerActive', observe);
    }
    /**
     * Adds automatic editor messages on drag&drop zone elements.
     *
     * @private
     */
    _addEditorMessages() {
        const $wrap = this.$editable.find('.oe_structure.oe_empty, [data-oe-type="html"]');
        this.$editorMessageElement = $wrap.not('[data-editor-message]')
                .attr('data-editor-message', _t('DRAG BUILDING BLOCKS HERE'));
        $wrap.filter(':empty').attr('contenteditable', false);
    }
    /**
     * Get the areas on the page that should be editable.
     *
     * @returns {Node[]} list of nodes that can be edited.
     */
    _getContentEditableAreas() {
        const savableElements = $(this.iframe.el.contentDocument).find(this.savableSelector)
                                .not('input, [data-oe-readonly],[data-oe-type="monetary"],[data-oe-many2one-id], [data-oe-field="arch"]:empty');
        return Array.from(savableElements).filter(element => !element.closest('.o_not_editable'));
    }
    /**
     * This method provides support for the legacy event system.
     * It sends events to the root_widget in the iframe when it needs
     * to (e.g. widgets_stop_request). It also provides support for the
     * action_demand. See {@link _handleAction}.
     * If the event is not supported it uses the super class method's.
     * See {@link ComponentAdapter._trigger_up}.
     *
     * @override
     * @param {Event} event
     */
    _trigger_up(event) {
        switch (event.name) {
            case 'widgets_start_request':
                this._websiteRootEvent('widgets_start_request', event.data);
                break;
            case 'widgets_stop_request':
                this._websiteRootEvent('widgets_stop_request', event.data);
                break;
            case 'reload_editable':
                return this.props.reloadCallback(event, this.widget.el);
            case 'request_save':
                this.save().then(() => {
                    if (event.data.onSuccess) {
                        event.data.onSuccess();
                    } else {
                        this.props.quitCallback();
                    }
                });
                break;
            case 'request_cancel':
                return this.props.quitCallback();
            case 'action_demand': {
                const values = this._handleAction(event.data.actionName, event.data.params);
                if (event.data.onSuccess) {
                    event.data.onSuccess(values);
                }
                break;
            }
            case 'snippet_dropped':
                this._websiteRootEvent('widgets_start_request', event.data);
                break;
            case 'snippet_removed': {
                const $empty = this.$editable.find('.oe_empty');
                if (!$empty.children().length) {
                    $empty.empty(); // Remove any superfluous whitespace
                    this._addEditorMessages();
                }
                break;
            }
            case 'context_get':
                event.data.callback(
                    Object.assign({},
                        this.userService.context,
                        {website_id: this.websiteService.currentWebsite.id})
                );
                break;
            case 'reload_bundles':
                this._reloadBundles(event).then(result => {
                    event.data.onSuccess(result);
                })
                .catch(error => {
                    event.data.onFailure(error);
                });
                break;
        }
        return super._trigger_up(...arguments);
    }

    /***
     * Handles action request from inner widgets
     * @param actionName
     * @param params
     * @returns {*}
     * @private
     */
    _handleAction(actionName, params) {
        switch (actionName) {
            case 'get_page_option':
                return this.pageOptions[params[0]].value;
            case 'toggle_page_option': {
                return this._togglePageOption(...params);
            }
        }
        console.warn('action ', actionName, 'is not yet supported');
    }
    _togglePageOption(params) {
        const pageOption = this.pageOptions[params.name];
        pageOption.value = params.value === undefined ? !pageOption.value : params.value;
    }
    _websiteRootEvent(type, eventData = {}) {
        const websiteRootInstance = this.websiteService.websiteRootInstance;
        return websiteRootInstance.trigger_up(type, {...eventData});
    }
    _preventDefault(e) {
        e.preventDefault();
    }
    /**
     * Reloads the website customize bundles on both the web client and
     * the iframe
     */
    async _reloadBundles() {
        const bundles = await this.rpc('/website/theme_customize_bundle_reload');
        let $allLinksIframe = $();
        let $allLinksEditor = $();
        const proms = [];
        const createLinksProms = (bundleURLs, insertionEl) => {
            let $newLinks = $();
            for (const url of bundleURLs) {
                $newLinks = $newLinks.add('<link/>', {
                    type: 'text/css',
                    rel: 'stylesheet',
                    href: url + `?${new Date().getTime()}`, // Insures that the css will be reloaded.
                });
            }
            proms.push(new Promise((resolve, reject) => {
                let nbLoaded = 0;
                $newLinks.on('load error', () => {
                    if (++nbLoaded >= $newLinks.length) {
                        resolve();
                    }
                });
            }));
            insertionEl.after($newLinks);
        };
        _.map(bundles, (bundleURLs, bundleName) => {
            const selector = `link[href*="${bundleName}"]`;
            const $linksIframe = this.iframe.el.contentWindow.$(selector);
            const $linksEditor = $(selector);
            if ($linksEditor.length) {
                $allLinksEditor.add($linksEditor);
                createLinksProms(bundleURLs, $linksEditor.last());
            }
            if ($linksIframe.length) {
                $allLinksIframe = $allLinksIframe.add($linksIframe);
                createLinksProms(bundleURLs, $linksIframe.last());
            }
        });
        await Promise.all(proms).then(() => {
            $allLinksIframe.remove();
            $allLinksEditor.remove();
        });
    }
}
