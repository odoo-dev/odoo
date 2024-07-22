import { Record } from "@mail/core/common/record";

export class AppModel extends Record {
    static name = "t9n.App";

    activeProject = Record.one("t9n.project");
    activeLanguage = Record.one("t9n.language");
    activeResource = Record.one("t9n.resource");
    activeMessage = Record.one("t9n.message");
    /** @type {"ProjectList"|"LanguageList"|"ResourceList"|"TranslationEditor"} */
    activeView = "ProjectList";
}

AppModel.register();
