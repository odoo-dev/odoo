/** @odoo-module alias=mail.models.Follower.fields.channel **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'channel',
    id: 'mail.models.Follower.fields.channel',
    global: true,
    target: 'Thread',
});
