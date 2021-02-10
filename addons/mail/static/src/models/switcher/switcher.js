odoo.define('mail/static/src/models/message/message.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr, one2one } = require('mail/static/src/model/model_field.js');

function factory(dependencies) {

    class Switcher extends dependencies['mail.model'] {
        _computeSuggestionManager() {
            if (this.suggestionManager) {
                return;
            }
            return [['create', { thread: [['link', this.thread]] }]];
        }
    }

    Switcher.fields = {
        suggestionManager: one2one('mail.suggestionManager', {
            compute: '_computeSuggestionManager',
        }),
    };

    Switcher.modelName = 'mail.message';

    return Switcher;
}

registerNewModel('mail.message', factory);

});
