odoo.define('mail/static/src/components/gif/gif.js', function (require) {
'use strict';

const components = {
    GifCategories: require('mail/static/src/components/gif_categories/gif_categories.js'),
    GifList: require('mail/static/src/components/gif_list/gif_list.js'),
};

const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useUpdate = require('mail/static/src/component_hooks/use_update/use_update.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class Gif extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useUpdate({ func: () => this._update() });
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

    async _onKeydown(ev) {
        this.gifManager.search(ev.target.value.trim());
    }

    /**
     * @private
     */
    _update() {
        this.trigger('o-popover-compute');
    }

    mounted() {
        this.gifManager.getCategories();
    }

    _onClickGif(gif) {
        this.gifManager.insertGif(gif);
    }

}

Object.assign(Gif, {
    components,
    props: {
        gifManagerLocalId: String,
    },
    template: 'mail.Gif',
});

return Gif;

});
