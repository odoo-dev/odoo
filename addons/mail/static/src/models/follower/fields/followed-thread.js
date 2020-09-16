/** @odoo-module alias=mail.models.Follower.fields.followedThread **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'followedThread',
    id: 'mail.models.Follower.fields.followedThread',
    global: true,
    target: 'Thread',
    inverse: 'followers',
});
