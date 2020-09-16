/** @odoo-module alias=mail.models.FollowerSubtypeList.fields.follower **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'follower',
    id: 'mail.models.FollowerSubtypeList.fields.follower',
    global: true,
    target: 'Follower',
});
