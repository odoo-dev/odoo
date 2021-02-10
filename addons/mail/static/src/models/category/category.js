odoo.define('mail/static/src/models/category/category.js', function (require) {
'use strict'

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr } = require('mail/static/src/model/model_field.js');

function factory(dependencies) {
    class Category extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------
        
        toggleIsOpen() {
            this.update({ isOpen: !this.isOpen });
        }

    }

    Category.fields = {
        id: attr(),
        displayName: attr(),
        isOpen: attr({
            default: false,
        }),
    };

    Category.modelName = 'mail.category'

    return Category;
}

registerNewModel('mail.category', factory);

});