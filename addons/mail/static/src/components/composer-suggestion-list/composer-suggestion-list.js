/** @odoo-module alias=mail.components.ComposerSuggestionList **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;

class ComposerSuggestionList extends usingModels(Component) {}

Object.assign(ComposerSuggestionList, {
    defaultProps: {
        isBelow: false,
    },
    props: {
        composer: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Composer') {
                    return false;
                }
                return true;
            },
        },
        isBelow: Boolean,
    },
    template: 'mail.ComposerSuggestionList',
});

QWeb.registerComponent('ComposerSuggestionList', ComposerSuggestionList);

export default ComposerSuggestionList;
