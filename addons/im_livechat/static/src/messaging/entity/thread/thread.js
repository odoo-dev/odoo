odoo.define('im_livechat.messaging.entity.Thread', function (require) {
'use strict';

const {
    registerClassPatchEntity,
    registerInstancePatchEntity,
} = require('mail.messaging.entityCore');

registerClassPatchEntity('Thread', 'im_livechat.messaging.entity.Thread', {

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @override
     */
    convertData(data) {
        const data2 = this._super(data);
        if ('livechat_visitor' in data) {
            if (!data2.members) {
                data2.members = [];
            }
            if (!data.livechat_visitor.id) {
                // Create partner derived from public partner.
                const partner = this.env.entities.Partner.create(
                    Object.assign(
                        this.env.entities.Partner.convertData(data.livechat_visitor),
                        { id: this.env.entities.Partner.getNextPublicId() }
                    )
                );
                data2.correspondent = [['link', partner]];
                data2.members.push(['link', partner]);
            } else {
                const partnerData = this.env.entities.Partner.convertData(data.livechat_visitor);
                data2.correspondent = [['insert', partnerData]];
                data2.members.push(['insert', partnerData]);
            }
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
        if (this.channel_type === 'livechat' && this.correspondent) {
            return this.correspondent.nameOrDisplayName;
        }
        return this._super();
    },
});

});
