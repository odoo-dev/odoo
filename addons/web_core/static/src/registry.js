/**
 * -----------------------------------------------------------------------------
 * Registry
 * -----------------------------------------------------------------------------
 * File description
 * -----------------------------------------------------------------------------
 */

import { Registry } from "@odoo/owl";

// @todo Registry needs better types

/** @type {Registry<Registry<any>>} */
export const registry = new Registry("main", Registry);
