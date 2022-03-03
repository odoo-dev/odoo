/** @odoo-module */

import { loadWysiwyg } from 'web_editor.loader';
import websiteRootInstance from '../js/content/website_root_instance';

// FIXME: Should be made more robust to ensure we're in edit mode.
if (window.parent !== window) {
    // FIXME: Probably don't need the entire package, most likely just styles.
    loadWysiwyg(['website.compiled_assets_wysiwyg']);
    window.websiteRootInstance = websiteRootInstance;
}
