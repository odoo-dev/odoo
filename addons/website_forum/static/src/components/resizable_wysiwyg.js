import { Wysiwyg } from "@html_editor/wysiwyg";
import { useRef } from "@odoo/owl";

export class ResizableWysiwyg extends Wysiwyg {
    static props = {
        ...Wysiwyg.props,
        setContentRef: Function,
    };

    setup() {
        super.setup();
        this.props.setContentRef(useRef("content"));
    }
}
