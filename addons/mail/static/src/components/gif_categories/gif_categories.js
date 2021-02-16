odoo.define('mail/static/src/components/gif_categories/gif_categories.js', function (require) {
'use strict';

const components = {};

const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const useUpdate = require('mail/static/src/component_hooks/use_update/use_update.js');

const { Component } = owl;

class GifCategories extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useUpdate({ func: () => this._update() });
        useStore(props => {
            const gifManager = this.env.models['mail.gif_manager'].get(props.gifManagerLocalId);
            const gifCategory = this.env.models['mail.gif_category'].get(props.gifCategoryLocalId);
            console.log(gifCategory);
            return {
                gifManager: gifManager ? gifManager.__state : undefined,
                gifCategory: gifCategory ? gifCategory.__state : undefined,
            };
        });
    }

    /**
     * @returns {mail.gif_manager}
     */
    get gifManager() {
        return this.env.models['mail.gif_manager'].get(this.props.gifManagerLocalId);
    }

    get getCategory() {
        return this.env.models['mail.gif_category'].get(this.props.gifCategoryLocalId);
    }

    /**
     * @private
     */
    _update() {
        this.trigger('o-popover-compute');
    }

    mounted() {
        console.log("test");
    }

}

Object.assign(GifCategories, {
    components,
    props: {
        gifManagerLocalId: String,
        gifCategoryLocalId: String,
    },
    template: 'mail.GifCategories',
});

return GifCategories;

});
