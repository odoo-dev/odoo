/** @odoo-module **/

import { ComponentWrapper } from 'web.OwlCompatibility';
import { View } from './legacy_view_adapter.js';

export class KnowledgeEmbededView {
    /**
     * @param {Widget} fieldHtmlInjector
     * @param {HTMLElement} anchor
     * @returns {Promise}
     */
    mount (fieldHtmlInjector, anchor) {
        if (fieldHtmlInjector.editor) {
            fieldHtmlInjector.editor.observerUnactive('knowledge_embeded_view');
        }
        const widget = new ComponentWrapper(this, View, {
            resModel: anchor.getAttribute('data-res-model'),
            type: anchor.getAttribute('data-view-type'),
            views: [[
                parseInt(anchor.getAttribute('data-view-id')) || false,
                anchor.getAttribute('data-view-type')
            ]],
            withControlPanel: true,
            context: {}, // TODO: Fetch action and context
            onPushState: () => {
                console.log('onPushState');
            },
        });
        const container = anchor.querySelector('.o_knowledge_embeded_view_container');
        return widget.mount(container).finally(() => {
            if (fieldHtmlInjector.editor) {
                fieldHtmlInjector.editor.observerActive('knowledge_embeded_view');
            }
        });
    }
}
