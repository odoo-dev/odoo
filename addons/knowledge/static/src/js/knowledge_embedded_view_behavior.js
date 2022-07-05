/** @odoo-module **/

import { ComponentWrapper } from 'web.OwlCompatibility';
import { EmbeddedView } from './embedded_view.js';
import { KnowledgeBehavior } from './knowledge_behaviors';

export const KnowledgeEmbeddedViewBehavior = KnowledgeBehavior.extend({
    init: function (handler, anchor, mode) {
        this._super.apply(this, arguments);
        this.container = anchor.querySelector('.o_knowledge_embedded_view_container');
        this.actWindowId = this.anchor.getAttribute('data-res_id');
        this.viewType = Array.from(anchor.classList)
                             .find(className => className.startsWith('o_knowledge_embedded_view_type_'))
                             .split('o_knowledge_embedded_view_type_')[1];
    },
    removeBehavior: function () {
        if (this.viewWrapper && this.viewWrapper.el) {
            this.viewWrapper.unmount();
        }
        this.container.replaceChildren();
        this._super.apply(this, arguments);
    },
    /**
     * @override
     * @returns {Promise}
     */
    mountComponents: async function () {
        const promise = this._super.apply(this, arguments);
        if (this.handler.editor) {
            this.handler.editor.observerUnactive('knowledge_embedded_view');
        }
        this.viewWrapper = new ComponentWrapper(this, EmbeddedView, {
            actionId: this.actWindowId,
            viewType: this.viewType,
        });
        return Promise.all([
            promise,
            this.viewWrapper.mount(this.container).finally(() => {
                if (this.handler.editor) {
                    this.handler.editor.observerActive('knowledge_embedded_view');
                }
            })
        ]);
    },
});
