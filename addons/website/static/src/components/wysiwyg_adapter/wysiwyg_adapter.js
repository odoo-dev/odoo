/** @odoo-module */

import { ComponentAdapter } from 'web.OwlCompatibility';
import { _t } from '@web/core/l10n/translation';

import { useWowlService } from '@web/legacy/utils';

const { onWillStart, onMounted } = owl;


export class WysiwygAdapterComponent extends ComponentAdapter {
    /**
     * @override
     */
    setup() {
        const options = this.props.options || {};
        this.iframe = this.props.iframe;
        this.websiteService = useWowlService('website');
        this.userService = useWowlService('user');

        this.oeStructureSelector = '#wrapwrap .oe_structure[data-oe-xpath][data-oe-id]';
        this.oeFieldSelector = '#wrapwrap [data-oe-field]';
        this.oeCoverSelector = '#wrapwrap .s_cover[data-res-model], #wrapwrap .o_record_cover_container[data-res-model]';
        if (options.savableSelector) {
            this.savableSelector = options.savableSelector;
        } else {
            this.savableSelector = `${this.oeStructureSelector}, ${this.oeFieldSelector}, ${this.oeCoverSelector}`;
        }

        onWillStart(() => {
            this.editable.classList.add('o_editable');
            this.editableFromEditorMenu(this.$editable).addClass('o_editable');
            this._addEditorMessages();
        });

        onMounted(() => {
            // useExternalListener only work on setup, but save button doesn't exist on setup
            this.widget.el.querySelector('[data-action="save"]').addEventListener('click', this._onSaveButtonClick.bind(this));
            this.widget.el.querySelector('[data-action="cancel"]').addEventListener('click', this._onDiscardButtonClick.bind(this));
            this._setObserver();
            if (this.props.target) {
                this.widget.snippetsMenu.activateSnippet($(this.props.target));
            }
            this.websiteService.context.edition = 'started';
            // Initializing Page Options
            this.pageOptions = {};
            const pageOptionEls = this.iframe.el.contentDocument.querySelectorAll('.o_page_option_data');
            for (const pageOptionEl of pageOptionEls) {
                this.pageOptions[pageOptionEl.name] = pageOptionEl.value;
            }
        });
        super.setup();
    }
    /**
     * @override
     */
    updateWidget(nextProps) {
        if (!nextProps.state.edition) {
            this.widget.destroy();
        }
    }
    /**
     * Stop the widgets and save the content.
     *
     * @returns {Promise} the save promise from the Wysiwyg widget.
     */
    async save() {
        await this._websiteRootEvent('widgets_stop_request');
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
        const savableElements = this.iframe.el.contentDocument
                                .querySelectorAll('input, [data-oe-readonly],[data-oe-type="monetary"],[data-oe-many2one-id], [data-oe-field="arch"]:empty');
        return Array.from(savableElements).filter(element => !element.closest('.o_not_editable'));
    }
    /**
     * This method provides support for the legacy event system.
     * It sends events to the root_widget in the iframe when it needs
     * to (e.g widgets_stop_request). It also provides support for the
     * action_demand. See {@link _handle_action}.
     * If the event is not supported it uses the super class method's.
     * See {@link ComponentAdapter._trigger_up}.
     *
     * @override
     * @param {Event} event
     */
    async _trigger_up(event) {
        switch (event.name) {
            case 'widgets_start_request':
                this._websiteRootEvent('widgets_start_request', event.data);
                break;
            case 'reload_editable':
                return this.props.reloadCallback(event, this.widget.el);
            case 'request_save':
                await this.save();
                if (event.data.onSuccess) {
                    event.data.onSuccess();
                }
                break;
            case 'action_demand':
                event.data.onSuccess(this._handle_action(event.data.actionName, event.data.params));
                break;
            case 'snippet_dropped':
                this._websiteRootEvent('widgets_start_request', event.data);
                break;
            case 'context_get':
                event.data.callback(this.userService.context);
                break;
        }
        return super._trigger_up(...arguments);
    }

    _handle_action(actionName, params) {
        if (actionName === 'get_page_option') {
            return this.pageOptions[params];
        }
        switch (actionName) {
            case 'get_page_option':
                return this.pageOptions[params];
            case 'toggle_page_option':
                console.warn('Cannot toggle page option yet', params);
        }
        console.warn('action ', actionName, 'is not yet supported');
    }
    async _websiteRootEvent(type, eventData = {}) {
        const websiteRootInstance = await this.iframe.el.contentWindow.websiteRootInstance;
        websiteRootInstance.trigger_up(type, {...eventData});
    }
    async _onSaveButtonClick(event) {
        await this.save();
        return this.props.quitCallback();
    }
    async _onDiscardButtonClick(event) {
        return this.props.quitCallback();
    }
}
