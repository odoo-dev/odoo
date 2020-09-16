/** @odoo-module alias=mail.components.ThreadTypingIcon **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class ThreadTypingIcon extends usingModels(Component) {}

Object.assign(ThreadTypingIcon, {
    defaultProps: {
        animation: 'none',
        size: 'small',
    },
    props: {
        animation: {
            type: String,
            validate: prop => ['bounce', 'none', 'pulse'].includes(prop),
        },
        size: {
            type: String,
            validate: prop => ['small', 'medium'].includes(prop),
        },
        title: {
            type: String,
            optional: true,
        }
    },
    template: 'mail.ThreadTypingIcon',
});

export default ThreadTypingIcon;
