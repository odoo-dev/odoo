odoo.define('im_livechat.messaging.entity.Thread', function (require) {
'use strict';

const {
    registerClassPatchEntity,
    registerFieldPatchEntity,
    registerInstancePatchEntity,
} = require('mail.messaging.entityCore');
const { attr } = require('mail.messaging.EntityField');

registerClassPatchEntity('Thread', 'im_livechat.messaging.entity.Thread', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    convertData(data) {
        const data2 = this._super(data);
        if ('correspondent_name' in data) {
            data2.correspondent_name = data.correspondent_name;
        }
        return data2;
    },
});

registerInstancePatchEntity('Thread', 'im_livechat.messaging.entity.Thread', {

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * @override
     */
    _computeDisplayName() {
        if (this.channel_type === 'livechat') {
            return this.correspondent_name;
        }
        return this._super();
    },
});

registerFieldPatchEntity('Thread', 'im_livechat.messaging.entity.Thread', {
    displayName: attr({
        dependencies: [
            'correspondent_name',
        ],
    }),
    correspondent_name: attr(),
});

});
