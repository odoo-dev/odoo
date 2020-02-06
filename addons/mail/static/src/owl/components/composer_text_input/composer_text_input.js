odoo.define('mail.component.ComposerTextInput', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters, useRef } = owl.hooks;

/**
 * ComposerInput relies on a minimal HTML editor in order to support mentions.
 */
class ComposerTextInput extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            return {
                isMobile: state.isMobile,
                composer: state.composers[props.composerLocalId],
            };
        });
        /**
         * Reference of the textarea. Useful to set height, selection and content.
         */
        this._textareaRef = useRef('textarea');
    }

    /**
     * Updates the composer text input content when composer is mounted
     * as textarea content can't be changed from the DOM.
     */
    mounted() {
        this._update();
    }

    /**
     * Updates the composer text input content when composer has changed
     * as textarea content can't be changed from the DOM.
     */
    patched() {
        this._update();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    focus() {
        this._textareaRef.el.focus();
    }

    focusout() {
        this.saveStateInStore();
        this._textareaRef.el.blur();
    }

    /**
     * Returns textarea current content.
     *
     * @returns {string}
     */
    getContent() {
        return this._textareaRef.el.value;
    }

    /**
     * Saves the composer text input state in store
     */
    saveStateInStore() {
        const data = {
            textInputContent: this.getContent(),
            textInputCursorStart: this._getSelectionStart(),
            textInputCursorEnd: this._getSelectionEnd(),
        };
        this.storeDispatch(
            'saveComposerTextInput',
            this.props.composerLocalId,
            data,
        );
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

        /**
     * Returns selection end position.
     *
     * @private
     * @returns {integer}
     */
    _getSelectionEnd() {
        return this._textareaRef.el.selectionEnd;
    }

    /**
     * Returns selection start position.
     *
     * @private
     * @returns {integer}
     *
     */
    _getSelectionStart() {
        return this._textareaRef.el.selectionStart;
    }

    /**
     * Determines whether the textarea is empty or not.
     *
     * @private
     * @return {boolean}
     */
    _isEmpty() {
        return this.getContent() === "";
    }

    /**
     * Updates the content and height of a textarea
     *
     * @private
     */
    _update() {
        this._textareaRef.el.value = this.storeProps.composer.textInputContent;
        this._textareaRef.el.setSelectionRange(
            this.storeProps.composer.textInputCursorStart,
            this.storeProps.composer.textInputCursorEnd);
        this._updateHeight();
    }

    /**
     * Updates the textarea height.
     *
     * @private
     */
    _updateHeight() {
        this._textareaRef.el.style.height = "0px";
        this._textareaRef.el.style.height = (this._textareaRef.el.scrollHeight) + "px";
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onInputTextarea() {
        this._updateHeight();
        this.trigger('o-input-composer-text-input');
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownTextarea(ev) {
        switch (ev.key) {
            case 'Enter':
                this._onKeydownTextareaEnter(ev);
                break;
            case 'Escape':
                this._onKeydownTextareaEscape(ev);
                break;
            default:
                break;
        }
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownTextareaEnter(ev) {
        if (!this.props.hasSendOnEnterEnabled) {
            return;
        }
        if (ev.shiftKey) {
            return;
        }
        if (this.storeProps.isMobile) {
            return;
        }
        this.trigger('o-keydown-enter');
        ev.preventDefault();
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownTextareaEscape(ev) {
        if (!this._isEmpty()) {
            return;
        }
        this.trigger('o-discard');
        ev.preventDefault();
    }
}

ComposerTextInput.defaultProps = {
    hasSendOnEnterEnabled: true
};

ComposerTextInput.props = {
    hasSendOnEnterEnabled: Boolean,
    composerLocalId: String,
};

ComposerTextInput.template = 'mail.component.ComposerTextInput';

return ComposerTextInput;

});
