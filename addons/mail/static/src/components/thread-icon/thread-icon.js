/** @odoo-module alias=mail.components.ThreadIcon **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class ThreadIcon extends usingModels(Component) {}

Object.assign(ThreadIcon, {
    props: {
        thread: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Thread') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.ThreadIcon',
});

QWeb.registerComponent('ThreadIcon', ThreadIcon);

export default ThreadIcon;
