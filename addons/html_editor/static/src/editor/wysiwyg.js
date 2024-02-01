import { onMounted, onWillDestroy, useEnv, useRef } from "@odoo/owl";
import { Editor } from "./editor";

export function wysiwyg(el, env, config) {
    const editor = new Editor(config, env.services);
    return editor;
}

export function useWysiwyg(refName, config = {}) {
    const env = useEnv();
    const ref = useRef(refName);
    const editor = new Editor(config, env.services);
    onMounted(() => {
        editor.attachTo(ref.el);
    });
    onWillDestroy(() => editor.destroy());
    return editor;
}
