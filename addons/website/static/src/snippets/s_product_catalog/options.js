
odoo.define('website.s_product_catalog_options', function (require) {
'use strict';

const core = require('web.core');
const snippetOptions = require('web_editor.snippets.options');

const _t = core._t;

snippetOptions.registry.ProductCatalog = snippetOptions.SnippetOptionWidget.extend({

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Show/hide descriptions.
     *
     * @see this.selectClass for parameters
     */
    async toggleDescription (previewMode, widgetValue, params) {
        await this.wysiwyg.execBatch(async ()=>{
            const $dishes = this.$('.s_product_catalog_dish');
            if (widgetValue) {
                for (const el of $dishes.toArray()) {
                    const $description = $(el).find('.s_product_catalog_dish_description');
                    if ($description.length) {
                        await this.editor.execCommand('dom.removeClass', {
                            domNode: $description[0],
                            class: 'd-none',
                        });
                    } else {
                        const descriptionEl = document.createElement('p');
                        descriptionEl.classList.add('s_product_catalog_dish_description', 'o_default_snippet_text');
                        descriptionEl.textContent = _t("Add a description here");

                        await this.editorCommands.insertHtml(
                            [el, 'INSIDE'],
                            descriptionEl.outerHTML
                        );
                    }
                }
            } else {
                for (const el of $dishes.toArray()) {
                    const $description = $(el).find('.s_product_catalog_dish_description');
                    if ($description.hasClass('o_default_snippet_text')) {
                        await this.editorCommands.remove($description[0]);
                    } else {
                        this.hasDescription = true;
                        await this.editor.execCustomCommand('dom.addClass', {
                            domNode: $description[0],
                            class: 'd-none',
                        });
                    }
                }
            }
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _computeWidgetState: function (methodName, params) {
        if (methodName === 'toggleDescription') {
            const $description = this.$('.s_product_catalog_dish_description');
            return $description.length && !$description.hasClass('d-none');
        }
        return this._super(...arguments);
    },
});
});
