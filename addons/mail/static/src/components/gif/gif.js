odoo.define('mail/static/src/components/gif/gif.js', function (require) {
'use strict';

const components = {};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useUpdate = require('mail/static/src/component_hooks/use_update/use_update.js');

const { Component, useState } = owl;

class Gif extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            categories: [],
        });
        useShouldUpdateBasedOnProps();
        useUpdate({ func: () => this._update() });

        this.apiKey = "5PFWYKTVK1VO";
    }

    async mounted() {
        const cat = await this._getCategory();
        this.state.categories = cat.tags;
        this._update();
    }

    /**
     * @private
     */
    _update() {
        this.trigger('o-popover-compute');
    }

    _ajax(endpoint, params = {}) {
        const _params = new URLSearchParams(params);
        _params.append('key', this.apiKey);
        _params.append('locale', this.env.messaging.locale.language);

        const stringParams = '?' + _params.toString();
        return $.get("https://g.tenor.com/v1/" + endpoint + stringParams);
    }

    _getCategory() {
        return this._ajax('categories');
    }

}

Object.assign(Gif, {
    components,
    defaultProps: {},
    props: {},
    template: 'mail.Gif',
});

return Gif;

});
