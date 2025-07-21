/** @odoo-module **/

import options from '@web_editor/js/editor/snippets.options';

options.registry.marquee = options.Class.extend({

    marqueeText(previewMode, widgetValue, params) {
        this.$target.find(".marquee-text").text(widgetValue || "Scrolling Text Here");
    },

    marqueeDirection(previewMode, widgetValue, params) {
        const $marquee = this.$target.find(".marquee-text");
        $marquee.attr("data-direction", widgetValue);
        this._applyAnimation($marquee);
    },

    marqueeSpeed(previewMode, widgetValue, params) {
        const $marquee = this.$target.find(".marquee-text");
        $marquee.attr("data-speed", widgetValue);
        this._applyAnimation($marquee);
    },

    _applyAnimation($el) {
        const direction = $el.attr("data-direction") || "left";
        const speed = $el.attr("data-speed") || "normal";
        $el.css("animation", `scroll-${direction} ${this._getSpeedDuration(speed)} linear infinite`);
    },

    _getSpeedDuration(speed) {
        switch (speed) {
            case "slow": return "15s";
            case "fast": return "5s";
            default: return "10s";
        }
    },

    _computeWidgetState(methodName, params) {
        const $el = this.$target.find(".marquee-text");
        switch (methodName) {
            case "marqueeText": return $el.text();
            case "marqueeDirection": return $el.attr("data-direction");
            case "marqueeSpeed": return $el.attr("data-speed");
            case "marqueeVisible": return this.$target.is(":visible");
        }
        return this._super(...arguments);
    },
});

export default {
    marquee: options.registry.marquee,
};
