/** @odoo-module alias=mail.models.Follower.fields.subtypes **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'subtypes',
    id: 'mail.models.Follower.fields.subtypes',
    global: true,
    target: 'FollowerSubtype',
});
