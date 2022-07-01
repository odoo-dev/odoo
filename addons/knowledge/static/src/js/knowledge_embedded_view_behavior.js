/** @odoo-module **/

import { ComponentWrapper } from 'web.OwlCompatibility';
import { View } from './legacy_view_adapter.js';
import { KnowledgeBehavior } from './knowledge_behaviors';
import pyUtils from 'web.py_utils';

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
        const actWindows = await this.handler._rpc({
            model: 'ir.actions.act_window',
            domain: [
                ['id', '=', this.actWindowId],
                ['view_mode', '=ilike', `%${this.viewType}%`],
            ],
            method: 'search_read',
            fields: ['context', 'res_model', 'views'],
        });
        const actWindow = actWindows[0];
        const context = pyUtils.py_eval(actWindow.context); // TODO: Is it safe ?
        actWindow.views.forEach((item) => {
            if (item[1] === 'tree') {
                item[1] = 'list';
            }
        });
        this.viewWrapper = new ComponentWrapper(this, View, {
            resModel: actWindow.res_model,
            type: this.viewType,
            views: actWindow.views,
            withControlPanel: true,
            context: context,
            /**
             * @param {integer} recordId
             */
            selectRecord: recordId => {
                this.handler.do_action({
                    type: 'ir.actions.act_window',
                    res_model: actWindow.res_model,
                    views: [[false, 'form']],
                    res_id: recordId,
                });
            },
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
