odoo.define('web_studio.EditorMixinOwl', function (require) {
    "use strict";

    return Editor => class extends Editor {
        handleDrop() { }

        highlightNearestHook() { }

        setSelectable() { }

        unselectedElements() { }
    };

});
