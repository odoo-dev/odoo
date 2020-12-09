import { OdooEnv } from "../types";

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
}

/**
 * Redirect to url by replacing window.location
 * If wait is true, sleep 1s and wait for the server i.e. after a restart.
 */
export function redirect(env: OdooEnv, url: string, wait?: number) {
  const browser = odoo.browser;
  const load = () => browser.location.assign(url);

  if (wait) {
    const wait_server = function () {
      env.services
        .rpc("/web/webclient/version_info", {})
        .then(load)
        .catch(function () {
          browser.setTimeout(wait_server, 250);
        });
    };
    browser.setTimeout(wait_server, 1000);
  } else {
    load();
  }
}
