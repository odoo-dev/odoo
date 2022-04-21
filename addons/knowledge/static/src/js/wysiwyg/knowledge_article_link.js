/** @odoo-module alias=knowledge.wysiwyg.article_link **/
"use strict";

import Dialog from 'web.Dialog';
import { _t } from 'web.core';

const KnowledgeArticleLinkModal = Dialog.extend({
    template: 'knowledge.wysiwyg_article_link_modal',
    /**
     * @override
     * @param {Widget} parent
     * @param {Object} options
     */
    init: function (parent, options) {
        // Set default options:
        options.title = options.title || _t('Choose an Article');
        options.buttons = options.buttons || [{
            text: _t('Ok'),
            classes: 'btn-primary',
            click: this.save.bind(this)
        }, {
            text: _t('Cancel'),
            close: true
        }];
        this._super(...arguments);
    },

    /**
     * @override
     * @returns
     */
    start: async function () {
        const result = await this._super(...arguments);
        this.initSelect2();
        return result;
    },

    /**
     * @returns {JQuery}
     */
    getInput: function () {
        return this.$el.find('input');
    },

    initSelect2: function () {
        const $input = this.getInput();
        $input.select2({
            ajax: {
                /**
                 * @param {String} term
                 * @returns {Object}
                 */
                data: term => {
                    return { term };
                },
                /**
                 * @param {Object} params - parameters
                 */
                transport: async params => {
                    const { term } = params.data;
                    const results = await this._rpc({
                        model: 'knowledge.article',
                        method: 'search_read',
                        kwargs: {
                            fields: ['id', 'icon', 'name'],
                            domain: [['name', '=ilike', `%${term}%`]],
                        },
                    });
                    params.success({ results });
                },
                /**
                 * @param {Object} data
                 * @returns {Object}
                 */
                processResults: data => {
                    return {
                        results: data.results.map(record => {
                            return {
                                id: record.id,
                                icon: record.icon || '📄',
                                text: record.name,
                            }
                        })
                    };
                },
            },
            /**
             * @param {Object} data
             * @param {JQuery} container
             * @param {Function} escapeMarkup
             */
            formatSelection: (data, container, escapeMarkup) => {
                const markup = [];
                if (typeof data.icon !== 'undefined') {
                    const icon = data.icon || '📄';
                    markup.push(escapeMarkup(icon) + ' ');
                }
                markup.push(escapeMarkup(data.text));
                return markup.join('');
            },
            /**
             * @param {Object} result
             * @param {JQuery} container
             * @param {Object} query
             * @param {Function} escapeMarkup
             */
            formatResult: (result, container, query, escapeMarkup) => {
                const { text } = result;
                const markup = [];
                Select2.util.markMatch(text, query.term, markup, escapeMarkup);
                if (typeof result.icon !== 'undefined') {
                    const icon = result.icon || '📄';
                    markup.unshift(escapeMarkup(icon) + ' ');
                }
                return markup.join('');
            },
        });
    },

    save: function () {
        const $input = this.getInput();
        const data = $input.select2('data');
        this.trigger('save', data);
    },
});

export default {
    KnowledgeArticleLinkModal: KnowledgeArticleLinkModal
};
