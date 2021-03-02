/** @odoo-module **/
import { ComponentAdapter } from 'web.OwlCompatibility';

const { Component } = owl;

export class EditorAdapter extends ComponentAdapter {
    constructor() {
        super(...arguments);
        this.env = Component.env; // use the legacy env
    }
}
