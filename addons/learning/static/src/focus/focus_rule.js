/**
 * Focus mode rule: which fields of a form a learner should look at. Pure
 * functions, so the rule can be tested and discussed on its own.
 */

/** Fields scoring at least this much (record name, status bar) are always in focus. */
export const ALWAYS_IMPORTANT = 100;

/**
 * The important fields the learner already knows, at most `cap` of them, most
 * important first. Always-important fields come on top of the cap.
 *
 * @param {Object} params
 * @param {Record<string, number>} params.profile importance score per field name
 * @param {Record<string, {type: string}>} params.fields fields of the record
 * @param {Set<string>} params.learnedTypes e.g. "char", "many2one"
 * @param {Set<string>} params.learnedFields field names known for this model
 * @param {number} params.cap
 * @returns {Set<string>}
 */
export function pickTopImportant({ profile, fields, learnedTypes, learnedFields, cap }) {
    const always = [];
    const known = [];
    for (const [name, score] of Object.entries(profile)) {
        if (!fields[name]) {
            continue;
        }
        if (score >= ALWAYS_IMPORTANT) {
            always.push(name);
        } else if (learnedFields.has(name) || learnedTypes.has(fields[name].type)) {
            known.push([name, score]);
        }
    }
    known.sort(([nameA, scoreA], [nameB, scoreB]) => scoreB - scoreA || nameA.localeCompare(nameB));
    return new Set([...always, ...known.slice(0, cap).map(([name]) => name)]);
}

/**
 * Whether one field is in focus. In order: a field that needs attention
 * (invalid), what the lesson teaches, what is needed to continue (required
 * and still empty), then the important fields the learner already knows.
 *
 * @param {{name: string, required: boolean, empty: boolean, invalid: boolean}} field
 * @param {{targets: Set<string>, topImportant: Set<string>}} context
 */
export function isFieldInFocus({ name, required, empty, invalid }, { targets, topImportant }) {
    return invalid || targets.has(name) || (required && empty) || topImportant.has(name);
}
