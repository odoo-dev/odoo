import { useState } from "@web/owl2/utils";
import { FormRenderer } from "@web/views/form/form_renderer";
import { FormLabelHighlightText } from "./highlight_text/form_label_highlight_text";
import { HighlightText } from "./highlight_text/highlight_text";
import { SearchableSetting } from "./settings/searchable_setting";
import { SettingHeader } from "./settings/setting_header";
import { SettingsBlock } from "./settings/settings_block";
import { SettingsApp } from "./settings/settings_app";
import { SettingsPage } from "./settings/settings_page";
import { normalize } from "@web/core/l10n/utils";

export class SettingsFormRenderer extends FormRenderer {
    static components = {
        ...FormRenderer.components,
        SearchableSetting,
        SettingHeader,
        SettingsBlock,
        SettingsPage,
        SettingsApp,
        HighlightText,
        FormLabel: FormLabelHighlightText,
    };
    static props = {
        ...FormRenderer.props,
        initialApp: String,
        slots: Object,
    };

    setup() {
        super.setup();
        this.searchState = useState(this.env.searchState);
    }

    get shouldAutoFocus() {
        return false;
    }

    isSettingVisible(fieldName, string, help, blockTitle, blockTip) {
        if (!this.searchState.value) {
            return true;
        }
        const blockTexts = [blockTitle, blockTip].join();
        if (normalize(blockTexts).includes(this.searchState.value)) {
            return true;
        }
        const settingTexts = [
            string ? string : this.props.record?.fields[fieldName]?.string,
            help,
        ].join();
        if (normalize(settingTexts).includes(this.searchState.value)) {
            return true;
        }
        return false;
    }
}
