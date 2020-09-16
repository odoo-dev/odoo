/** @odoo-module alias=mail.models.Thread.fields.followers **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'followers',
    id: 'mail.models.Thread.fields.followers',
    global: true,
    target: 'Follower',
    inverse: 'followedThread',
});
