odoo.define('mail/static/src/components/switcher/switcher.js', function (require) {
'use strict';

const components = {};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component, useState } = owl;
const { useRef } = owl.hooks;

class Switcher extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();

        this.state = useState({
            isOpen: false
        });

        useStore(props => {
            const switcher = this.env.messaging && this.env.messaging.switcher;
            return {
                switcher: switcher ? switcher.__state : undefined,
                isMessagingInitialized: this.env.isMessagingInitialized(),
            };
        });

        document.addEventListener("keydown", event => {
            // See doc: https://developer.mozilla.org/en-US/docs/Web/API/Document/keydown_event
            if (event.isComposing) {
                return;
            }

            if (event.ctrlKey && event.key == 'k' && !this.state.isOpen) {
                event.preventDefault();
                this._open();
            }

            if (event.key == 'Escape' && this.state.isOpen) {
                event.preventDefault();
                this._close();
            }
        });

        this._input = useRef('inputSwitcher');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    focus() {
        console.log(this._input);
        this._input.el.focus();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _open() {
        this.state.isOpen = true;
        this.focus();
    }

    _close() {
        this.state.isOpen = false;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------


}

Object.assign(Switcher, {
    components,
    props: {},
    template: 'mail.Switcher',
});

return Switcher;

});
