/** @odoo-module alias=website_livechat.components.VisitorBanner **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component } = owl;

class VisitorBanner extends usingModels(Component) {}

Object.assign(VisitorBanner, {
    props: {
        visitor: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Visitor') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'website_livechat.VisitorBanner',
});

export default VisitorBanner;
