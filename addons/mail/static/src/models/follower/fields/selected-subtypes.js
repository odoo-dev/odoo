/** @odoo-module alias=mail.models.Follower.fields.selectedSubtypes **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'selectedSubtypes',
    id: 'mail.models.Follower.fields.selectedSubtypes',
    global: true,
    target: 'FollowerSubtype',
});
