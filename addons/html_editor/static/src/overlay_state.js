import { providePlugins, signal, usePlugin, useScope } from "@odoo/owl";

class OverlayStatePlugin extends Plugin {
    isVisible = signal(true);
}

export function useOverlayState() {
    const scope = useScope();
    if (!scope.pluginManager.getPlugin(OverlayStatePlugin)) {
        return null;
    }
    return usePlugin(OverlayStatePlugin);
}

export function provideOverlayState() {
    providePlugins([OverlayStatePlugin]);
    return useOverlayState();
}
