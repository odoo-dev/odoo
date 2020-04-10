odoo.define('mail.messaging.entity.ActivityType', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, one2many } = require('mail.messaging.EntityField');

function ActivityTypeFactory({ Entity }) {

    class ActivityType extends Entity {}

    ActivityType.entityName = 'ActivityType';

    ActivityType.fields = {
        activities: one2many('Activity', {
            inverse: 'type',
        }),
        displayName: attr(),
        id: attr(),
    };

    return ActivityType;
}

registerNewEntity('ActivityType', ActivityTypeFactory);

});
