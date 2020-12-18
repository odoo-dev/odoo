/**
 * Escapes a string to use as a RegExp.
 * @url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
 * @param {String} str
 * @returns {String} escaped string to use as a RegExp
 */
export const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Intersperses ``separator`` in ``str`` at the positions indicated by
 * ``indices``.
 *
 * ``indices`` is an array of relative offsets (from the previous insertion
 * position, starting from the end of the string) at which to insert
 * ``separator``.
 *
 * There are two special values:
 *
 * ``-1``
 *   indicates the insertion should end now
 * ``0``
 *   indicates that the previous section pattern should be repeated (until all
 *   of ``str`` is consumed)
 *
 * @param {String} str
 * @param {Array<Number>} indices
 * @param {String} separator
 * @returns {String}
 */
export function intersperse(str: string, indices: number[], separator: string = ""): string {
  separator = separator || "";
  const result = [];
  let last = str.length;

  for (let i = 0; i < indices.length; ++i) {
    let section = indices[i];
    if (section === -1 || last <= 0) {
      // Done with string, or -1 (stops formatting string)
      break;
    } else if (section === 0 && i === 0) {
      // repeats previous section, which there is none => stop
      break;
    } else if (section === 0) {
      // repeat previous section forever
      //noinspection AssignmentToForLoopParameterJS
      section = indices[--i];
    }
    result.push(str.substring(last - section, last));
    last -= section;
  }

  const s = str.substring(0, last);
  if (s) {
    result.push(s);
  }
  return result.reverse().join(separator);
}

/**
 * Returns a string formatted using given values.
 * If the value is an object, its keys will replace `%(key)s` expressions.
 * If the values are a set of strings, they will replace `%s` expressions.
 * If no value is given, the string will not be formatted.
 */
export function sprintf(s: string, ...values: string[] | [{ [key: string]: string }]): string {
  if (values.length === 1 && typeof values[0] === "object") {
    const valuesDict = values[0] as { [key: string]: string };
    s = s.replace(/\%\(?([^\)]+)\)s/g, (match, value) => valuesDict[value]);
  } else if (values.length > 0) {
    s = s.replace(/\%s/g, () => values.shift() as string);
  }
  return s;
}

/**
 * Removes any duplicated alphabetic characters in a given string.
 *
 * Example:
 *  - "aa-bb-CCcc-ddD xxxx-Yy-ZZ" -> "a-b-Cc-dD x-Yy-Z"
 *  - "aa-bb-CCcc-ddD xxxx-Yy-ZZ" (ignoreCase: true) -> "a-b-C-d x-Y-Z"
 *
 * @param {String} str
 * @param {Object} options
 * @param {boolean} options.ignoreCase default: false
 * @returns String
 */
export const stripAlphaDupes = (
  str: string,
  options: { ignoreCase: boolean } = { ignoreCase: false }
): string => {
  const flags = options.ignoreCase ? "gi" : "g";
  const regex = new RegExp(/([a-zA-Z])(?<=\1[^\1])/.source, flags);
  return str.replace(regex, "");
};
