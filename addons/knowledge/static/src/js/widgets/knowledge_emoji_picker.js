/** @odoo-module **/

import Widget from 'web.Widget';
import { ComponentWrapper, WidgetAdapterMixin } from 'web.OwlCompatibility';
import EmojiPicker from '../../components/emoji_picker/emoji_picker.js';

const EmojiPickerWidget = Widget.extend(WidgetAdapterMixin, {
    events: {
        'click .dropdown-menu': '_onClick'
    },

    /**
     * @override
     * @param {Object} parent
     * @param {Object} options
     */
    init: function (parent, options) {
        this._super(...arguments);
        this.options = options;
    },

    /**
     * @override
     */
    start: function () {
        this.component = new ComponentWrapper(this, EmojiPicker, {
            /**
             * @param {String} unicode
             */
            onClickEmoji: unicode => {
                this.trigger_up('emoji_click', {
                    article_id: this.options.article_id,
                    unicode
                });
                this.close()
            }
        });
        const menu = this.el.querySelector('.dropdown-menu');
        return this.component.mount(menu);
    },

    /**
     * Closes the dropdown
     */
    close: function () {
        this.$el.dropdown('toggle');
    },

    /**
     * @param {Event} event
     */
    _onClick: function (event) {
        event.preventDefault();
        event.stopPropagation();
    },
});

export default EmojiPickerWidget;
