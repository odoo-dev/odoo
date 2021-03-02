odoo.define('web_studio.FormRenderer', function (require) {
    /**
     * Overrides on the form renderer to modify the behaviour
     * of buttons in form views so the that Studio Validation
     * mechanism works with them.
     *
     * Add a ApprovalComponent inside buttons with the `studio_approval`
     * attribute if they're visible.
     */
    'use strict';

    const FormRenderer = require('web.FormRenderer');
    const { ComponentWrapper } = require('web.OwlCompatibility');
    const ApprovalComponent = require('web_studio.ApprovalComponent');

    FormRenderer.include({
        /**
         * Override to add an approval widget (if needed) on header buttons.
         * @private
         * @param {Object} node
         * @returns {jQueryElement}
         */
        _renderHeaderButton(node) {
            const $button = this._super(...arguments);
            this._addApprovalComponent($button, node);
            return $button;
        },
        /**
         * Override to add an approval widget (if needed) on stat buttons.
         * @private
         * @param {Object} node
         * @returns {jQueryElement}
         */
        _renderStatButton(node) {
            const $button = this._super(...arguments);
            this._addApprovalComponent($button, node);
            return $button;
        },
        /**
         * Override to add an approval widget (if needed) on  generic buttons.
         * @private
         * @param {Object} node
         * @returns {jQueryElement}
         */
        _renderTagButton(node) {
            const $button = this._super(...arguments);
            this._addApprovalComponent($button, node);
            return $button;
        },
        /**
         * Append an ApprovalComponent to buttons that have the studio_approval
         * attribute set and that are visible (no 'invisible' modifier).
         * This is used for rendering only, the actual check of approval rules
         * is done in the form controller - there's no need to display the widget
         * for the approval flow to work (and hiding it on invisible buttons
         * spares us a few RPC calls).
         * @param {JQueryElement} $el
         * @param {Object} node
         */
        async _addApprovalComponent($el, node) {
            const attrs = node.attrs;
            const approvalEnabled = attrs.studio_approval && attrs.studio_approval !== 'False';
            const isInvisible = $el[0].classList.contains('o_invisible_modifier');
            if (approvalEnabled && !isInvisible) {
                const options = {
                    action: false,
                    /* actionName will be falsy for stat buttons, but the feature
                    is not really made for them and this is an informative field,
                    i'm not about to go exploring the tree of children of the node
                    to find a meaningful name */
                    actionName: attrs.string,
                    inStudio: Boolean(this.state.getContext().studio),
                    method: false,
                    model: this.state.model,
                    resId: this.state.res_id,
                };
                if (attrs.type === 'object') {
                    options.method = attrs.name;
                } else if (attrs.type === 'action') {
                    options.action = parseInt(attrs.name);
                }
                const approvalComponent = new ComponentWrapper(this, ApprovalComponent, options);
                await approvalComponent.mount($el[0]);
            }
        },
    });
});
