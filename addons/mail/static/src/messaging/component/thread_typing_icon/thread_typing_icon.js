odoo.define('mail.messaging.component.ThreadTypingIcon', function (require) {
'use strict';

const { Component } = owl;

class ThreadTypingIcon extends Component {}

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
    template: 'mail.messaging.component.ThreadTypingIcon',
});

return ThreadTypingIcon;

});
