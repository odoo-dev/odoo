import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ensureFunction } from "@web/core/utils/functions";
import { useOwnedDialogs, useService } from "@web/core/utils/hooks";
import { odoomark } from "@web/core/utils/strings";

/**
@typedef {{
    addCreate?: MaybeFunction<boolean>;
    addCreateEdit?: MaybeFunction<boolean>;
    addNoRecord?: MaybeFunction<boolean>;
    addSearchMore?: MaybeFunction<boolean>;
    addStartTyping?: MaybeFunction<boolean>;
    context?: MaybeFunction<Record<string, any>>;
    domain?: MaybeFunction<import("@web/core/domain").DomainListRepr>;
    limit?: MaybeFunction<number>;
    onRecordSelected(record: Record<string, any>): MaybePromise<void>;
    resModel: MaybeFunction<string>;
    specification?: MaybeFunction<Record<string, any>>;
    threshold?: MaybeFunction<number, [request: string]>;
}} RecordSuggesterConstructorParams
*/

export class RecordSuggester {
    /** @protected @type {import("@web/core/orm_service").ORM} */
    orm;
    /** @protected @type {import("@web/core/dialog/dialog_service").DialogServiceInterface} */
    dialog;

    /** @protected @type {() => boolean} */
    addCreate;
    /** @protected @type {() => boolean} */
    addCreateEdit;
    /** @protected @type {() => boolean} */
    addNoRecord;
    /** @protected @type {() => boolean} */
    addSearchMore;
    /** @protected @type {() => boolean} */
    addStartTyping;
    /** @protected @type {() => Record<string, any>} */
    context;
    /** @protected @type {() => import("@web/core/domain").DomainListRepr} */
    domain;
    /** @protected @type {() => number} */
    limit;
    /** @protected @type {(record: Record<string, any>) => MaybePromise<void>} */
    onRecordSelected;
    /** @protected @type {() => string} */
    resModel;
    /** @protected @type {() => Record<string, any>} */
    specification;
    /** @protected @type {(request: string) => number} */
    threshold;

    createLabel;
    createEditLabel;
    noRecordLabel;
    searchMoreLabel;
    startTypingLabel;

    /**
     * @param {any} services
     * @param {RecordSuggesterConstructorParams} params
     */
    constructor(services, params) {
        this.orm = services.orm;
        this.dialog = services.dialog;

        this.addCreate = ensureFunction(params.addCreate ?? false);
        this.addCreateEdit = ensureFunction(params.addCreateEdit ?? false);
        this.addNoRecord = ensureFunction(params.addNoRecord ?? false);
        this.addSearchMore = ensureFunction(params.addSearchMore ?? false);
        this.addStartTyping = ensureFunction(params.addStartTyping ?? false);
        this.context = ensureFunction(params.context ?? {});
        this.domain = ensureFunction(params.domain ?? []);
        this.limit = ensureFunction(params.limit ?? 8);
        this.onRecordSelected = params.onRecordSelected;
        this.resModel = ensureFunction(params.resModel);
        this.specification = ensureFunction(params.specification ?? {});
        this.threshold = ensureFunction(params.threshold ?? 0);
    }

    /**
     * @param {string} request
     * @returns {Promise<Record<string, any>[]>}
     */
    async fetchRecords(request) {
        return this.orm.call(this.resModel(), "web_name_search", [], {
            name: request,
            operator: "ilike",
            domain: this.domain(),
            limit: this.limit(),
            context: this.context(),
            specification: {
                display_name: {},
                ...this.specification(),
            },
        });
    }

    searchMore() {
        // fine for now but we don't like this kind of dependence of core to views
        const SelectCreateDialog = registry.category("dialogs").get("select_create");
        return new Promise((resolve) => {
        });
    }

    /**
     * @param {string} request
     * @param {<T>(value: MaybePromise<T>) => Promise<T>} lock
     * @returns {Promise<import("@web/core/autocomplete/suggester_hook").Suggestion[]>}
     */
    async suggest(request, lock) {
        /** @type {import("@web/core/autocomplete/suggester_hook").Suggestion<{ record?: Record<string, any> }>[]} */
        const suggestions = [];

        let addSearchMore = true;
        const threshold = this.threshold(request);

        if (request.length < threshold) {
            if (this.addStartTyping()) {
                suggestions.push({
                    label: _t("Start typing..."),
                });
            }
        } else {
            const records = await lock(this.fetchRecords(request));
            addSearchMore = records.length > 0;
            if (records.length) {
                for (const record of records) {
                    const label = record.__formatted_display_name || record.display_name;
                    suggestions.push({
                        data: { record },
                        label: label ? odoomark(label.split("\n")[0]) : _t("Unnamed"),
                        onSelected: () => this.onRecordSelected(record),
                    });
                }
            } else if (this.addNoRecord()) {
                suggestions.push({
                    label: _t("No records"),
                });
            }
        }

        if (request.length) {
            if (this.addCreate()) {
                suggestions.push({
                    label: "",
                    onSelected: () => {},
                });
            }

            if (this.addCreateEdit()) {
                suggestions.push({
                    label: "",
                    onSelected: () => {},
                });
            }
        }

        if (addSearchMore && this.addSearchMore()) {
            suggestions.push({
                label: "",
            });
        }

        return suggestions;
    }
}

/**
 * @template {new (...a: any) => RecordSuggester} [T=new (services: any, params: RecordSuggesterConstructorParams) => RecordSuggester]
 * @param {{ suggesterType?: T } & ConstructorParameters<T>[1]} params
 * @returns {InstanceType<T>}
 */
export function useRecordSuggester(params) {
    const suggester = params.suggesterType ?? RecordSuggester;
    const services = {
        orm: useService("orm"),
        dialog: useOwnedDialogs(),
    };
    return new suggester(services, params);
}
