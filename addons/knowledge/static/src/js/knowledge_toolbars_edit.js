/** @odoo-module */

import { setCursorStart, setCursorEnd } from '@web_editor/../lib/odoo-editor/src/OdooEditor';
import { KnowledgeToolbar } from './knowledge_toolbars';

/**
 * @see KnowledgeToolbar
 * This override is loaded as an asset of web_editor to access the cursor
 * positioning utilities.
 * This is needed when removing the template (using the trash button of the
 * toolbar). The cursor will be repositionned in the html field and ensure the
 * html field is properly set up. (edit helper placeholder and proper empty body
 * content).
 */
KnowledgeToolbar.include({
    /**
     * set the toolbar anchor as non-editable
     *
     * @override
     */
    init: function () {
        this._super.apply(this, arguments);
        if (this.mode === 'edit') {
            this.editor.observerUnactive('knowledge_toolbar_uneditable');
            this.anchor.setAttribute('contenteditable', 'false');
            this.editor.observerActive('knowledge_toolbar_uneditable');
        }
    },
    /**
     * Create a <p><br></p> element, in case the toolbar container is the last
     * element of the field_html when it is removed
     *
     * @param {Element} parent
     * @returns {Element}
     */
    _setupEmptyHtmlBody: function (parent) {
        const document = parent.ownerDocument;
        const pElement = document.createElement('P');
        const brElement = document.createElement('BR');
        pElement.append(brElement);
        parent.append(pElement);
        return pElement;
    },
    /**
     * @override
     * @param {Element} button
     */
    _setupButton: function (button) {
        this._super.apply(this, arguments);
        switch (button.dataset.call) {
            /**
             * Handle the trash button of a toolbar_container to remove the
             * block
             */
            case 'trash':
                button.addEventListener("click", function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();

                    const previousElement = this.container.previousElementSibling;
                    const nextElement = this.container.nextElementSibling;
                    const parent = this.container.parentElement;
                    this.container.remove();
                    if (nextElement) {
                        setCursorStart(nextElement);
                    } else if (previousElement) {
                        setCursorEnd(previousElement);
                    } else {
                        setCursorStart(this._setupEmptyHtmlBody(parent));
                    }
                    this.editor.historyStep();
                }.bind(this));
                break;
        }
    }
});
