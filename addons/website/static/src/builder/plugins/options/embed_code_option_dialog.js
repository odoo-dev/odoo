import { Dialog } from "@web/core/dialog/dialog";
import { CodeEditor } from "@web/core/code_editor/code_editor";
import { DialogPlugin } from "@web/core/dialog/dialog_plugin";
import { EditHeadBodyDialog } from "@website/components/edit_head_body_dialog/edit_head_body_dialog";
import { Component, proxy, t, usePlugin, useProps } from "@odoo/owl";

export class EmbedCodeOptionDialog extends Component {
    static template = "website.EmbedCodeOptionDialog";
    static components = { Dialog, CodeEditor };
    props = useProps({
        title: t.string(),
        value: t.string(),
        mode: t.string(),
        confirm: t.function(),
        close: t.function(),
    });
    setup() {
        this.dialog = usePlugin(DialogPlugin);
        this.state = proxy({ value: this.props.value });
    }
    onCodeChange(newValue) {
        this.state.value = newValue;
    }
    onConfirm() {
        this.props.confirm(this.state.value);
        this.props.close();
    }
    onInjectHeadOrBody() {
        this.dialog.add(EditHeadBodyDialog);
        this.props.close();
    }
}
