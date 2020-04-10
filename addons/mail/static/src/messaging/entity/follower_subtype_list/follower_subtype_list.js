odoo.define('mail.messaging.entity.FollowerSubtypeList', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { many2one } = require('mail.messaging.EntityField');

function FollowerSubtypeListFactory({ Entity }) {

    class FollowerSubtypeList extends Entity {}

    FollowerSubtypeList.entityName = 'FollowerSubtypeList';

    FollowerSubtypeList.fields = {
        follower: many2one('Follower'),
    };

    return FollowerSubtypeList;
}

registerNewEntity('FollowerSubtypeList', FollowerSubtypeListFactory);

});
