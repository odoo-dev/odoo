odoo.define('mail/static/src/components/switcher/switcher.js', function (require) {
'use strict';

const components = {};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component, useState } = owl;

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

        // useStore(props => {
        //     const follower = this.env.models['mail.follower'].get(props.followerLocalId);
        //     return [follower ? follower.__state : undefined];
        // });

        document.addEventListener("keydown", event => {
            // See doc: https://developer.mozilla.org/en-US/docs/Web/API/Document/keydown_event
            if (event.isComposing || event.keyCode === 229) {
                return;
            }

            if (event.ctrlKey && event.keyCode == 75) {
                event.preventDefault();
                this._open();
            }
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    _open() {
        this.state.isOpen = true;
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
