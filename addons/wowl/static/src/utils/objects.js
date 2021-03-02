/** @odoo-module **/

/**
 * Shallow compares two objects.
 */
export function shallowEqual(obj1, obj2) {
  return (
    Object.keys(obj1).length === Object.keys(obj2).length &&
    Object.keys(obj1).every((key) => obj1[key] === obj2[key])
  );
}
