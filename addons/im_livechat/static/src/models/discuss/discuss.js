odoo.define('im_livechat/static/src/models/discuss/discuss.js', function (require) {
'use strict'

const { registerFieldPatchModel } = require('mail/static/src/model/model_core.js');

const { one2one } = require('mail/static/src/model/model_field.js');

registerFieldPatchModel('mail.discuss', 'im_livechat/static/src/models/discuss/discuss.js', {
    categoryLivechat: one2one('mail.category', {
        default: [['create', {
            name: "livechat",
            displayName: "Live Chats",
            isOpen: true,
        }]],
    }),
});

});