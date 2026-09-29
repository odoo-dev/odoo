import { onMounted, onWillUnmount, usePlugin } from "@odoo/owl";
import { HotkeyPlugin } from "@web/core/hotkeys/hotkey_plugin";

/**
 * This hook will register/unregister the given registration
 * when the caller component will mount/unmount.
 *
 * @param {string} hotkey
 * @param {import("./hotkey_plugin").HotkeyCallback} callback
 * @param {import("./hotkey_plugin").HotkeyOptions} [options] additional options
 */
export function useHotkey(hotkey, callback, options = {}) {
    const hotkeyService = usePlugin(HotkeyPlugin);
    let cleanup;
    onMounted(() => {
        cleanup = hotkeyService.add(hotkey, callback, options);
    });
    onWillUnmount(() => cleanup());
}
