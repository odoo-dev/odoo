odoo.define('/web/static/lib/bootstrap/js/popover.js', function () {
    "use strict";
    //The pop-up will be overflowed on the right and bottom.
    Popper.Defaults.modifiers.preventOverflow.priority = ['right', 'left', 'bottom', 'top'];
});
