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

        onWillStart(() => {
            this.editable.classList.add('o_editable');
            this.editableFromEditorMenu(this.$editable).addClass('o_editable');
        });

        onMounted(() => {
            this.websiteService.context.edition = 'started';
        });
        super.setup();
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
     * Get the areas on the page that should be editable.
     *
     * @returns {Node[]} list of nodes that can be edited.
     */
    _getContentEditableAreas() {
        const savableElements = this.iframe.el.contentDocument
                                .querySelectorAll('input, [data-oe-readonly],[data-oe-type="monetary"],[data-oe-many2one-id], [data-oe-field="arch"]:empty');
        return Array.from(savableElements).filter(element => !element.closest('.o_not_editable'));
    }
}
