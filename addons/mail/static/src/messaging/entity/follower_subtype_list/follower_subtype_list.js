odoo.define('mail.messaging.entity.FollowerSubtypeList', function (require) {
'use strict';

const {
    fields: {
        many2one,
    },
    registerNewEntity,
} = require('mail.messaging.entity.core');

function FollowerSubtypeListFactory({ Entity }) {

    class FollowerSubtypeList extends Entity {

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        _update(data) {
            const { follower } = data;
            if (follower) {
                this.link({ follower });
            }
        }
    }

    FollowerSubtypeList.fields = {
        follower: many2one('Follower'),
    };

    return FollowerSubtypeList;
}

registerNewEntity('FollowerSubtypeList', FollowerSubtypeListFactory);

});
