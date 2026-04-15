import { Component, computed, props, signal, types } from "@odoo/owl";
import { localization } from "@web/core/l10n/localization";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useOwnedDialogs } from "@web/core/utils/hooks";

import { TranslationDialog } from "./translation_components";
import { TranslateModel } from "./translation_model";
import { Record } from "@web/model/relational_model/record";
import { omit } from "@web/core/utils/objects";

export class TranslationButton extends Component {
    static template = "web.TranslationButton";
    static Plugins = [TranslateModel];

    props = props(
        {
            fieldName: types.string(),
            "fieldType?": types.string(),
            "resModel?": types.string(),
            "resId?": types.number(),
            "record?": types.object({
                resModel: types.string(),
                resId: types.any(),
                fields: types.object(),
                "activeFields?": types.object(),
                "evalContext?": types.object(),
            }),
            "fieldComponentClass?": types.constructor(Component),
            "fieldComponentProps?": types.object(),
            "getFakeRecordInfos?": types.function(),
            "classes?": types.signal(types.object()),
            "beforeOpen?": types.function(),
            "onSaved?": types.function(),
            "dialogTitle?": types.signal(),
        },
        {
            classes: signal.Object({ o_field_translate: true, "btn-link": true }),
        }
    );

    resModel = computed(() => this.props.resModel ?? this.props.record.resModel);
    resId = computed(() => this.props.resId ?? this.props.record.resId);
    field = computed(() =>
        this.props.record
            ? this.props.record.fields[this.props.fieldName]
            : { name: this.props.fieldName, type: this.props.fieldType }
    );
    onSaved = computed(
        () =>
            this.props.onSaved ?? (this.props.record ? () => this.props.record.model.load() : null)
    );
    dialogTitle = computed(
        () =>
            this.props.dialogTitle?.() ??
            _t('Translate "%s"', this.field().string ?? this.props.fieldName)
    );

    dialogParams = computed(() => this._getDialogParams());

    isMultiLang = localization.multiLang;
    lang = new Intl.Locale(user.lang).language.toUpperCase();

    isClickable = computed(() => {
        if (this.props.record) {
            return !this.props.record._virtualId;
        }
        return true;
    });

    buttonClasses = computed(() => ({
        ...this.props.classes(),
        "text-muted": !this.isClickable(),
    }));

    buttonTooltip = computed(() =>
        !this.isClickable() ? _t("Save this record and its parent to translate.") : null
    );

    setup() {
        this.addDialog = useOwnedDialogs();
    }

    getFakeRecordInfos() {
        const record = this.props.record;
        const fields = {};
        const activeFields = {};
        const values = {};
        for (const fname in record.fields || {}) {
            const f = record.fields[fname];
            if (!["one2many", "many2many", "many2one"].includes(f.type)) {
                fields[fname] = f;
                activeFields[fname] = omit(
                    record.activeFields[fname],
                    "invisible",
                    "readonly",
                    "required"
                );
                values[fname] = record.evalContext[fname];
            }
        }
        return {
            fields,
            activeFields,
            values,
            currentField: this.field(),
        };
    }

    _getDialogParams() {
        return {
            Dialog: TranslationDialog,
            props: {
                Plugins: [...this.constructor.Plugins],
                config: {
                    field: this.field,
                    resId: this.resId,
                    resModel: this.resModel,
                },
                title: this.dialogTitle,
                getFakeRecordInfos: this.getFakeRecordInfos.bind(this),
                fieldComponentClass: this.props.fieldComponentClass,
                fieldComponentProps: this.props.fieldComponentProps,
                onSaved: this.onSaved,
            },
        };
    }

    async beforeOpen() {
        if (this.props.beforeOpen) {
            return this.props.beforeOpen();
        }
        const record = this.props.record;
        if (!record) {
            return;
        }

        const saved =
            record.model.root instanceof Record
                ? await record.model.root.save()
                : await record?.save();
        return saved;
    }

    async onClick() {
        if (!this.isClickable() || this.closeDialog) {
            return;
        }
        if (!((await this.beforeOpen()) ?? true)) {
            return;
        }
        const { Dialog, props } = this.dialogParams();
        const options = {
            onClose: () => (this.closeDialog = null),
        };
        this.closeDialog = this.addDialog(Dialog, props, options);
    }
}
