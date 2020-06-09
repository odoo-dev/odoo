odoo.define('website.s_progress_bar_options', function (require) {
'use strict';

const core = require('web.core');
const utils = require('web.utils');
const snippetOptions = require('web_editor.snippets.options');

const _t = core._t;

snippetOptions.registry.progress = snippetOptions.SnippetOptionWidget.extend({

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Changes the position of the progressbar text.
     *
     * @see this.selectClass for parameters
     */
    display: async function (previewMode, widgetValue, params) {
        await this.wysiwyg.execBatch(async () => {
            // retro-compatibility

            let $text = this.$target.find('.s_progress_bar_text');

            // todo: Test this.
            if (this.$target.hasClass('progress')) {
                this.$target.removeClass('progress');
                await this.editor.execCommand('dom.removeClass', {
                    domNode: this.$target[0],
                    class: 'progress',
                });
                await this.editorCommands.wrap(
                    this.$target.find('.progress-bar')[0], $('<div/>', {
                        class: 'progress',
                    })[0].outerHTML);
                await this.editor.execCommand('dom.addClass', {
                    domNode: this.$target.find('.progress-bar span')[0],
                    class: 's_progress_bar_text',
                });
            }

            await this.editorCommands.remove($text[0].childNodes[0]);
            if (!$text.length) {
                $text = $('<span/>').addClass('s_progress_bar_text').html(_t('80% Development'));
            }


            if (widgetValue === 'inline') {
                await this.editorCommands.insertHtml(
                    [this.$target.find('.progress-bar')[0], 'INSIDE'],
                    $text[0].outerHTML,
                );
            } else {
                await this.editorCommands.insertHtml(
                    [this.$target.find('.progress')[0], 'BEFORE'],
                    $text[0].outerHTML,
                );
            }
        });
    },
    /**
     * Sets the progress bar value.
     *
     * @see this.selectClass for parameters
     */
    progressBarValue: async function (previewMode, widgetValue, params) {
        await this.wysiwyg.execBatch(async () => {
            let value = parseInt(widgetValue);
            value = utils.confine(value, 0, 100);
            const $progressBar = this.$target.find('.progress-bar');
            const $progressBarText = this.$target.find('.s_progress_bar_text');
            // Target precisely the XX% not only XX to not replace wrong element
            // eg 'Since 1978 we have completed 45%' <- don't replace 1978
            const previousProgressChildNodes = $progressBarText[0].childNodes[0];
            $progressBarText.text($progressBarText.text().replace(/[0-9]+%/, value + '%'));
            const replacedText = $progressBarText[0].outerHTML;
            await this.editorCommands.replace(
                previousProgressChildNodes,
                replacedText
            );
            await this.editorCommands.setStyle($progressBar[0], 'width', value + "%");
            await this.editor.execCommand('dom.setAttribute', {
                domNode: $progressBar[0],
                name: 'aria-valuenow',
                value: '' + value,
            });
        });
            const $progressBar = this.$target.find('.progress-bar');
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _computeWidgetState: function (methodName, params) {
        switch (methodName) {
            case 'display': {
                const isInline = this.$target.find('.s_progress_bar_text')
                                        .parent('.progress-bar').length;
                return isInline ? 'inline' : 'below';
            }
            case 'progressBarValue': {
                return this.$target.find('.progress-bar').attr('aria-valuenow') + '%';
            }
        }
        return this._super(...arguments);
    },
});
});
