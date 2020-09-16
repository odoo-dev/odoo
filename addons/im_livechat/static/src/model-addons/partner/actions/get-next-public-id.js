/** @odoo-module alias=im_livechat.modelAddons.Partner.actions.getNextPublicId **/

import action from 'mail.action.define';

let nextPublicId = -1;

export default action({
    name: 'Partner/getNextPublicId',
    id: 'im_livechat.modelAddons.Partner.actions.getNextPublicId',
    global: true,
    func() {
        const id = nextPublicId;
        nextPublicId -= 1;
        return id;
    },
});
