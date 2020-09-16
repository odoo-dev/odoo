/** @odoo-module alias=mail.components.MessageAuthorPrefix **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class MessageAuthorPrefix extends usingModels(Component) {}

Object.assign(MessageAuthorPrefix, {
    props: {
        message: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Message') {
                    return false;
                }
                return true;
            },
        },
        thread: {
            type: Object,
            optional: true,
            validate(p) {
                if (p.constructor.modelName !== 'Thread') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.MessageAuthorPrefix',
});

export default MessageAuthorPrefix;
