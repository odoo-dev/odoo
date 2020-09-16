/** @odoo-module alias=mail.models.Device.actions.stop **/

import action from 'mail.action.define';

export default action({
    name: 'Device/stop',
    id: 'mail.models.Device.actions.stop',
    global: true,
    func(
        _,
        device,
    ) {
        window.removeEventListener('resize', device._onResize);
        device._onResize = () => {};
    },
});
