odoo.define('mail/static/src/components/category_title/category_title.js', function (require) {
'use strict'

const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class CategoryTite extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const category = this.env.models['mail.category'].get(this.props.categoryLocalId);
            return {
                category: category ? category.__state : undefined,
            }
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    
    /**
     * @returns {mail.category}
     */
    get category() {
        return this.env.models['mail.category'].get(this.props.categoryLocalId);
    }

    get title() {
        return this.env._t(this.category.displayName);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------
    
    /**
     * @private
     */
    _toggleCategoryOpen() {
        this.category.toggleIsOpen();
    }
    
}

Object.assign(CategoryTite, {
    props: {
        categoryLocalId: String,
        unreadCounter: Number,
    },
    template: 'mail.CategoryTitle',
});

return CategoryTite;

});