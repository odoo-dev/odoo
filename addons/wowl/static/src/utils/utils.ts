import { OdooEnv } from "../types";

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

export function isBrowserChromium(): boolean {
  // true for the browser base on Chromium (Google Chrome, Opera, Edge)
  return navigator.userAgent.includes("Chrome");
}

/**
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called after it stops being called for
 * N milliseconds. If `immediate` is passed, trigger the function on the
 * leading edge, instead of the trailing.
 *
 * Inspired by https://davidwalsh.name/javascript-debounce-function
 */
export function debounce(func: Function, wait: number, immediate?: boolean): Function {
  let timeout: number;
  return function (this: any) {
    const context = this;
    const args = arguments;
    function later() {
      if (!immediate) {
        func.apply(context, args);
      }
    }
    const callNow = immediate && !timeout;
    odoo.browser.clearTimeout(timeout);
    timeout = odoo.browser.setTimeout(later, wait);
    if (callNow) {
      func.apply(context, args);
    }
  };
}

/**
 * For debugging purpose, this function will convert a json node back to xml
 */
export function json_node_to_xml(env: OdooEnv, node: any, human_readable: any, indent: number) {
  indent = indent || 0;
  const sindent = human_readable ? new Array(indent + 1).join("\t") : "";
  let r = sindent + "<" + node.tag;
  const cr = human_readable ? "\n" : "";

  if (typeof node === "string") {
    return (
      sindent +
      node
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
    );
  } else if (
    typeof node.tag !== "string" ||
    <any>!node.children instanceof Array ||
    <any>!node.attrs instanceof Object
  ) {
    throw new Error(`${env._t("Node [%s] is not a JSONified XML node")} ${JSON.stringify(node)}`);
  }
  for (const attr in node.attrs) {
    let vattr = node.attrs[attr];
    if (typeof vattr !== "string") {
      // domains, ...
      vattr = JSON.stringify(vattr);
    }
    vattr = vattr
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    if (human_readable) {
      vattr = vattr.replace(/&quot;/g, "'");
    }
    r += " " + attr + '="' + vattr + '"';
  }
  if (node.children && node.children.length) {
    r += ">" + cr;
    const childs = [];
    for (let i = 0, ii = node.children.length; i < ii; i++) {
      childs.push(json_node_to_xml(env, node.children[i], human_readable, indent + 1));
    }
    r += childs.join(cr);
    r += cr + sindent + "</" + node.tag + ">";
    return r;
  } else {
    return r + "/>";
  }
/*
 * Helper function returning an extraction handler to use on array elements to
 * return a certain attribute or mutated form of the element.
 */
function _getExtractorFrom(criterion: string | Function): any {
  switch (typeof criterion) {
    case "string":
      return (element: any) => element[criterion];
    case "function":
      return criterion;
    default:
      throw new Error(
        `Expected criterion of type 'string' or 'function' and got '${typeof criterion}'`
      );
  }
}
/**
 * Returns an object holding different groups defined by a given criterion
 * or a default one. Each group is a subset of the original given list.
 * The given criterion can either be:
 * - a string: a property name on the list elements which value will be the
 * group name,
 * - a function: a handler that will return the group name from a given
 * element.
 *
 * @param {any[]} list
 * @param {string | function} [criterion]
 * @returns {Object}
 */
export function groupBy(list: any[], criterion: string | Function): Object {
  const extract = _getExtractorFrom(criterion);
  const groups: { [key: string]: any } = {};
  for (const element of list) {
    const group = String(extract(element));
    if (!(group in groups)) {
      groups[group] = [];
    }
    groups[group].push(element);
  }
  return groups;
}

export class KeepLast {
  id: number = 0;
  add(promise: Promise<any>) {
    this.id++;
    const currentId = this.id;
    return new Promise((resolve, reject) => {
      promise
        .then((value) => {
          if (this.id === currentId) {
            resolve(value);
          }
        })
        .catch((reason) => {
          // not sure about this part
          if (this.id === currentId) {
            reject(reason);
          }
        });
    });
  }
}
