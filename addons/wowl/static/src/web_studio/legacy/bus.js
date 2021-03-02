odoo.define('web_studio.bus', function (require) {
"use strict";

var Bus = require('web.Bus');

var bus = new Bus();

/* Events on this bus
 * ==================
 *
 * `studio_toggled`
 *      Studio has been toggled
 *      @param mode: ['app_creator', 'main']
 *
 * `studio_main`
 *      Studio main has been opened
 *      @param action: the edited action
 *
 * `action_changed`
 *      the action used by Studio has been changed (updated server side).
 *      @param action: the updated action
 *
 * `edition_mode_entered`
 *      the view has entered in edition mode.
 *      @param view_type
 *
 * `toggle_snack_bar`
 *     a temporary message needs to be displayed.
 *     @param type either 'saved' or 'saving'
 *
 * `(un,re)do_clicked`
 *      during the view edition, the button (un,re)do has been clicked.
 *
 * `(un,re)do_available`
 *      during the view edition, the button (un,re)do has become available.
 *
 * `(un,re)do_not_available`
 *      during the view edition, the button (un,re)do has become unavailable.
 *
 */

return bus;

});
