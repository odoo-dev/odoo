import { Component, t, useProps } from "@odoo/owl";

export class ActionHelper extends Component {
    static template = "web.ActionHelper";
    props = useProps({
        noContentHelp: t.string().optional(),
        // string picto name, `false` to explicitly render none, or absent
        // (falls back to the field's "EmptyFolder" default upstream).
        picto: t.or([t.string(), t.boolean()]).optional(),
    });

    get showDefaultHelper() {
        return !this.props.noContentHelp;
    }
}
