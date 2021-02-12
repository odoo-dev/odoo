odoo.define('mail/static/src/components/gif_list/gif_list.js', function (require) {
'use strict';

const components = {};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component, useState } = owl;

class GifList extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore(props => {
            const gifManager = this.env.models['mail.gif_manager'].get(props.gifManagerLocalId);
            return {
                gifManager: gifManager ? gifManager.__state : undefined,
            };
        });
    }
    /**
     * @returns {mail.gif_manager}
     */
    get gifManager() {
        return this.env.models['mail.gif_manager'].get(this.props.gifManagerLocalId);
    }

}

Object.assign(GifList, {
    components,
    props: {
        gifManagerLocalId: String,
    },
    template: 'mail.GifList',
});

return GifList;

});
