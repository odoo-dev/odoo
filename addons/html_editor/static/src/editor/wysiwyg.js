/** @odoo-module */

import { onMounted, onWillDestroy, useEnv, useRef } from "@odoo/owl";
import { DomPlugin } from "./core/dom_plugin";
import { FormatPlugin } from "./core/format_plugin";
import { HintPlugin } from "./core/hint_plugin";
import { HistoryPlugin } from "./core/history_plugin";
import { OverlayPlugin } from "./core/overlay_plugin";
import { Editor } from "./editor";
import { PowerboxPlugin } from "./powerbox/powerbox_plugin";
import { ToolbarPlugin } from "./toolbar/toolbar_plugin";
import { TablePlugin } from "./table/table_plugin";
import { ListPlugin } from "./list/list_plugin";

export function wysiwyg(el, env, config) {
    const Plugins = [
        HistoryPlugin,
        HintPlugin,
        DomPlugin,
        FormatPlugin,
        OverlayPlugin,
        ToolbarPlugin,
        PowerboxPlugin,
        TablePlugin,
        ListPlugin,
    ];

    // const env = useEnv();
    const editor = new Editor(Plugins, config, env.services);
    return editor;
}

export function useWysiwyg(refName, config = {}) {
    const Plugins = [
        HistoryPlugin,
        HintPlugin,
        DomPlugin,
        FormatPlugin,
        OverlayPlugin,
        ToolbarPlugin,
        PowerboxPlugin,
        TablePlugin,
        ListPlugin,
    ];

    const env = useEnv();
    const ref = useRef(refName);
    const editor = new Editor(Plugins, config, env.services);
    onMounted(() => {
        editor.attachTo(ref.el);
    });
    onWillDestroy(() => editor.destroy());
    return editor;
}
