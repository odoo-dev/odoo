odoo.define('mail/static/src/components/category/category.js', function (require) {
'use strict'

const { Component } = owl;
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

class Category extends Component {
    
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const category = this.env.models['mail.category'].get(props.categoryLocalId);
            return {
                category: category ? category.__state : undefined,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    get category() {
        return this.env.models['mail.category'].get(this.props.categoryLocalId);
    }
    
}

Object.assign(Category, {
    props: {
        categoryLocalId: String,
    },
    template: 'mail.Category',
});

return Category;

});