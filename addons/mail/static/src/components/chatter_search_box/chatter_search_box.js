odoo.define('mail/static/src/components/chatter_search_box/chatter_search_box.js', function (require) {
'use strict';

const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const useUpdate = require('mail/static/src/component_hooks/use_update/use_update.js');

const { Component } = owl;
const { useRef } = owl.hooks;

class ChatterSearchBox extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.models['mail.thread'].get(props.threadLocalId);
            const mainCache = thread ? thread.mainCache : undefined;
            return {
                mainCacheFilteredMessagesLength: mainCache && mainCache.filteredMessages.length,
                mainCacheIsSearchingMessages: mainCache && mainCache.isSearchingMessages,
                thread: thread ? thread.__state : undefined,
            };
        });
        /**
         * Updates the text input content when search box is mounted
         * as input content can't be changed from the DOM.
         */
        useUpdate({ func: () => this._update() });
        /**
         * Reference of the input. Useful to set content.
         */
        this._inputRef = useRef('input');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread|undefined}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    focus() {
        this._inputRef.el.focus();
    }

    /**
     * Saves the text input state in store
     */
    saveStateInStore() {
        this.thread.update({ searchedText: this._inputRef.el.value });
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Updates the content
     *
     * @private
     */
    _update() {
        if (!this.thread) {
            return;
        }
        this._inputRef.el.value = this.thread.searchedText;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onFocusout() {
        this.saveStateInStore();
    }
    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydown(ev) {
        if (ev.key === 'Enter') {
            this.saveStateInStore();
            if (!this._inputRef.el.value) {
                return;
            }
            const threadMainCache = this.thread && this.thread.mainCache;
            if (threadMainCache && !threadMainCache.isAllHistoryLoaded) {
                threadMainCache.getMessages();
            }
        }
    }

}

Object.assign(ChatterSearchBox, {
    props: {
        threadLocalId: String,
    },
    template: 'mail.ChatterSearchBox',
});

return ChatterSearchBox;

});
