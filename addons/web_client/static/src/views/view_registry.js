import { Component, Registry } from "@odoo/owl";

/** @type {Registry<import("@odoo/owl").ComponentConstructor>} */
export const viewRegistry = new Registry("views", Component.prototype);
