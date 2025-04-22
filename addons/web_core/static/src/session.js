/** @odoo-module alias=@web/core/session default=false */

/**
 * -----------------------------------------------------------------------------
 * Odoo Session
 * -----------------------------------------------------------------------------
 *
 * Extracts the session info injected by the server into
 * `odoo.__session_info__` and assigns it to the exported `session` object.
 *
 * The session typically includes keys such as the user ID (`uid`), user
 * context, Odoo database name, server version, and other metadata required
 * during client-side initialization.
 * -----------------------------------------------------------------------------
 */

export const session = odoo.__session_info__ || {};
delete odoo.__session_info__;
