odoo.define('mail.widget.Chatter', function (require) {
"use strict";

const Chatter = require('mail.component.Chatter');
const EnvMixin = require('mail.widget.EnvMixin');

const Widget = require('web.Widget');

const ChatterWidget = Widget.extend(EnvMixin, {
    /**
     * @param {web.Widget} parent
     * @param {Object} props
     */
    init(parent, props) {
        this._super.apply(this, arguments);
        this.component = undefined;
        this.props = props;
    },
    /**
     * @override {web.Widget}
     */
    willStart() {
        return Promise.all([
            this._super.apply(this, arguments),
            this.getEnv()
        ]);
    },
    /**
     * @override {web.Widget}
     */
    destroy() {
        if (this.component) {
            this.component.destroy();
        }
        this._super.apply(this, arguments);
    },
    async on_attach_callback() {
        if (this.component) {
            return;
        }
        this.component = new Chatter(this.env, this.props);
        await this.component.mount(this.$el[0]);

        for (const className of this.el.classList) {
            this.component.el.classList.add(className);
        }
        // unwrap
        this.el.parentNode.insertBefore(this.component.el, this.el);
        this.el.parentNode.removeChild(this.el);
    },

    /**
     * @param {Object} props
     */
    update(props) {
        const oldModel = this.props.record.model;
        const oldResId = this.props.record.res_id;
        this.props = props;
        if (
            oldModel === this.props.record.model &&
            oldResId === this.props.record.res_id
        ) {
            this.component.__updateProps(props);
        } else {
            this.component.destroy();
            this.component = null;
            this.on_attach_callback();
        }
    }
});

return ChatterWidget;

});
