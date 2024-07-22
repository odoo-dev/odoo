import { Component, useState } from "@odoo/owl";

import { ProjectList } from "@t9n/core/project_list";
import { LanguageList } from "@t9n/core/language_list";
import { ResourceList } from "@t9n/core/resource_list";
import { TranslationEditor } from "@t9n/core/translation_editor";

import { useService } from "@web/core/utils/hooks";

/**
 * The "root", the "homepage" of the translation application.
 */
export class App extends Component {
    static components = { LanguageList, ProjectList, ResourceList, TranslationEditor };
    static props = {};
    static template = "t9n.App";

    setup() {
        this.store = useState(useService("mail.store"));
    }

    get activeView() {
        return this.store.t9n.activeView;
    }
}
