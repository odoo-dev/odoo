import { ComposerAction } from "@mail/core/common/composer_actions";

import { patch } from "@web/core/utils/patch";

/**
 * Full composer is not available in project sharing (this file only loads in
 * project.webclient).
 */
patch(ComposerAction.prototype, {
    _condition({ owner }) {
        if (this.id === "open-full-composer") {
            return false;
        }
        return super._condition(...arguments);
    },
});
