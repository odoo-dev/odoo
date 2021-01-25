odoo.define('mail/static/src/components/switcher/switcher.js', function (require) {
'use strict';

const components = {};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class Switcher extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        // useStore(props => {
        //     const follower = this.env.models['mail.follower'].get(props.followerLocalId);
        //     return [follower ? follower.__state : undefined];
        // });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------


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
