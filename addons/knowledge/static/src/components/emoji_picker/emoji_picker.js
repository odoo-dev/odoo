/** @odoo-module **/

import emojis from '@mail/js/emojis';
const { Component } = owl;

class EmojiPicker extends Component {
    /**
     * @override
     */
    setup () {
        super.setup();
        this.emojis = emojis;
        this.className = '';
        this.emojiListView = {
            /**
             * @param {Event} event
             */
            onClickEmoji: event => {
                const $target = $(event.target);
                if (this.props.onClickEmoji) {
                    this.props.onClickEmoji($target.data('unicode'));
                }
            }
        }
    }
}

EmojiPicker.template = 'knowledge.EmojiList';
EmojiPicker.props = ['onClickEmoji'];

export default EmojiPicker;
