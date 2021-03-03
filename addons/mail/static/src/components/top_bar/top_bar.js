odoo.define('mail/static/src/components/top_bar/top_bar.js', function (require) {
'use strict';

const components = {
    PartnerSelector: require('mail/static/src/components/partner_selector/partner_selector.js'),
};
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class TopBar extends Component {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        useStore((...args) => this._useStoreSelector(...args));
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread_view}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Returns data selected from the store.
     *
     * @private
     * @param {Object} props
     * @returns {Object}
     */
    _useStoreSelector(props) {
        const thread = this.env.models['mail.thread'].get(props.threadLocalId);
        return {
            thread,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

}

Object.assign(TopBar, {
    components,
    defaultProps: {

    },
    props: {
        threadLocalId: String,
    },
    template: 'mail.TopBar',
});

return TopBar;

});
