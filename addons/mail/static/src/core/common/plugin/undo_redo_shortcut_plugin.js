import { usePlugin } from "@odoo/owl";
import { Plugin } from "@html_editor/plugin";
import { HotkeyPlugin } from "@web/core/hotkeys/hotkey_plugin";

/**
 * Registers the undo/redo shortcuts, as ShortCutPlugin is not part of the text plugin set.
 *
 * Native undo cannot revert the content inserted through the editor (mentions,
 * emojis, canned responses, pasted content): it is only recorded in its own
 * history.
 */
export class UndoRedoShortcutPlugin extends Plugin {
    static id = "undoRedoShortcut";
    static dependencies = ["history"];
    hotkey = usePlugin(HotkeyPlugin);

    setup() {
        const { undo, redo } = this.dependencies.history;
        this.addShortcut("control+z", undo);
        this.addShortcut("control+y", redo);
        this.addShortcut("control+shift+z", redo);
    }

    addShortcut(hotkey, run) {
        this._cleanups.push(
            this.hotkey.add(hotkey, run, {
                // the editable is not a valid hotkey target by default
                bypassEditableProtection: true,
                allowRepeat: true,
                // not bound to the UI active element of the editor creation
                global: true,
                // active element rather than target, to also work in a shadow root
                isAvailable: () =>
                    this.editable.contains(this.editable.getRootNode().activeElement),
            })
        );
    }
}
