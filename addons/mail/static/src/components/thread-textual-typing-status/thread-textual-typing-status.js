/** @odoo-module alias=mail.components.ThreadTextualTypingStatus **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class ThreadTextualTypingStatus extends usingModels(Component) {}

Object.assign(ThreadTextualTypingStatus, {
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
    template: 'mail.ThreadTextualTypingStatus',
});

QWeb.registerComponent('ThreadTextualTypingStatus', ThreadTextualTypingStatus);

export default ThreadTextualTypingStatus;
