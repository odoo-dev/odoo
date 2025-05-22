import { status, useComponent } from "@odoo/owl";
import { KeepLast } from "@web/core/utils/concurrency";

/**
@typedef {
    ReturnType<typeof import("@web/core/l10n/translation")._t> |
    ReturnType<typeof import("@odoo/owl").markup>
} SuggestionLabel
*/

/**
@template [T=any]
@typedef {{
    cssClass?: string | string[] | Record<string, boolean>;
    data?: T;
    label: SuggestionLabel;
    onSelected?(): MaybePromise<void>;
}} Suggestion
*/

/**
@template [T=any]
@typedef {(request: string, lock: <U>(value: MaybePromise<U>) => Promise<U>) => MaybePromise<Suggestion<T>[]>} SuggesterFn
*/

/**
@template [T=any]
@typedef {SuggesterFn<T> | { suggest: SuggesterFn<T> }} Suggester
*/

/**
 * @template [T=any]
 * @param {Suggester<T>} suggester
 * @returns {(request: string) => Promise<Suggestion<T>[]>}
 */
export function useSuggester(suggester) {
    const component = useComponent();
    const suggest = suggester instanceof Function ? suggester : suggester.suggest.bind(suggester);
    const keepLast = new KeepLast();
    return async (request) => {
        await keepLast.add(Promise.resolve());
        const result = await suggest(request, keepLast.add.bind(keepLast));
        if (status(component) === "destroyed") {
            return new Promise(() => {});
        }
        return result;
    };
}
