# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import tagged
from odoo.tests.common import TransactionCase
from odoo.tools.js_transpiler import convert_xml_tagged_template, transpile_javascript


@tagged('post_install', '-at_install')
class TestJsTranspiler(TransactionCase):
    maxDiff = None

    def test_01_alias(self):
        input_content = """/** @odoo-module alias=test_assetsbundle.Alias **/"""
        result = transpile_javascript("/test_assetsbundle/static/src/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/alias', [], function (require) {
'use strict';
let __exports = {};
/** @odoo-module alias=test_assetsbundle.Alias **/
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/alias';
return __exports;
});

odoo.define(`test_assetsbundle.Alias`, ['@test_assetsbundle/alias'], function (require) {
                        return require('@test_assetsbundle/alias')[Symbol.for("default")];
                        });
"""

        self.assertEqual(result, expected_result)

    def test_02_default(self):
        input_content = """/** @odoo-module alias=test_assetsbundle.Alias default=False **/"""
        result = transpile_javascript("/test_assetsbundle/static/src/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/alias', [], function (require) {
'use strict';
let __exports = {};
/** @odoo-module alias=test_assetsbundle.Alias default=False **/
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/alias';
return __exports;
});

odoo.define(`test_assetsbundle.Alias`, ['@test_assetsbundle/alias'], function (require) {
                        return require('@test_assetsbundle/alias');
                        });
"""

        self.assertEqual(result, expected_result)

        input_content = """/** @odoo-module alias=test_assetsbundle.Alias default=0 **/"""
        result = transpile_javascript("/test_assetsbundle/static/src/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/alias', [], function (require) {
'use strict';
let __exports = {};
/** @odoo-module alias=test_assetsbundle.Alias default=0 **/
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/alias';
return __exports;
});

odoo.define(`test_assetsbundle.Alias`, ['@test_assetsbundle/alias'], function (require) {
                        return require('@test_assetsbundle/alias');
                        });
"""

        self.assertEqual(result, expected_result)

        input_content = """/** @odoo-module alias=test_assetsbundle.Alias default=false **/"""
        result = transpile_javascript("/test_assetsbundle/static/src/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/alias', [], function (require) {
'use strict';
let __exports = {};
/** @odoo-module alias=test_assetsbundle.Alias default=false **/
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/alias';
return __exports;
});

odoo.define(`test_assetsbundle.Alias`, ['@test_assetsbundle/alias'], function (require) {
                        return require('@test_assetsbundle/alias');
                        });
"""

        self.assertEqual(result, expected_result)

    def test_03_classes(self):
        input_content = """export default class Nice {}

class Vehicule {}

export class Car extends Vehicule {}

export class Boat extends Vehicule {}

export const Ferrari = class Ferrari extends Car {};
"""
        result = transpile_javascript("/test_assetsbundle/static/src/classes.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/classes', [], function (require) {
'use strict';
let __exports = {};
const Nice = __exports[Symbol.for("default")] = class Nice {}

class Vehicule {}

const Car = __exports.Car = class Car extends Vehicule {}

const Boat = __exports.Boat = class Boat extends Vehicule {}

const Ferrari = __exports.Ferrari = class Ferrari extends Car {};

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/classes';
if (typeof Vehicule === "function") Vehicule.___filename = '@test_assetsbundle/classes';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_04_comments(self):
        input_content = """/**
 * This is a comment
 */

/**
 * This isn't a string
 */
export class Test {
  // This is a comment in a class
}

/* cool comment */ const a = 5; /* another cool comment */

const b = 5; // hello

// another one

const y = "this is a /* nice string and should be kept */";
const z = "this is a /* nice string and should be kept";
export const x = "this is a // nice string and should be kept";
const w = "this is a */ nice string and should be kept";

// This isn't a string
/*
  comments
 */
const aaa = "keep!";
/*
  comments
 */
"""
        result = transpile_javascript("/test_assetsbundle/static/src/comments.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/comments', [], function (require) {
'use strict';
let __exports = {};
/**
 * This is a comment
 */

/**
 * This isn't a string
 */
const Test = __exports.Test = class Test {
  // This is a comment in a class
}

/* cool comment */ const a = 5; /* another cool comment */

const b = 5; // hello

// another one

const y = "this is a /* nice string and should be kept */";
const z = "this is a /* nice string and should be kept";
const x = __exports.x = "this is a // nice string and should be kept";
const w = "this is a */ nice string and should be kept";

// This isn't a string
/*
  comments
 */
const aaa = "keep!";
/*
  comments
 */

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/comments';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_05_functions(self):
        input_content = """export function sayHello() {
  console.log("Hello");
}

export function sayHelloWorld() {
  console.log("Hello world");
}

export async function sayAsyncHello() {
  console.log("Hello Async");
}


export default function sayHelloDefault() {
  console.log("Hello Default");
}
"""
        result = transpile_javascript("/test_assetsbundle/static/src/functions.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/functions', [], function (require) {
'use strict';
let __exports = {};
__exports.sayHello = sayHello; function sayHello() {
  console.log("Hello");
}

__exports.sayHelloWorld = sayHelloWorld; function sayHelloWorld() {
  console.log("Hello world");
}

__exports.sayAsyncHello = sayAsyncHello; async function sayAsyncHello() {
  console.log("Hello Async");
}


__exports[Symbol.for("default")] = sayHelloDefault; function sayHelloDefault() {
  console.log("Hello Default");
}

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/functions';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_06_import(self):
        input_content = """/**
 * import { Dialog, Notification } from "../src/Dialog";
 */
import { Line1 } from "../src/Dialog";
import { Line2, Notification } from "../src/Dialog";
import { Line3, Notification } from "Dialog";
import { Line4, Notification } from "@tests/Dialog";
import { Line5, Notification } from "./Dialog";
import { Line6, Notification } from '../src/Dialog'
import Line7  from "../src/Dialog";
import  Line8  from '../src/Dialog';

import Line9  from "test.Dialog";
import  { Line10, Notification }  from 'test.Dialog2';

import * as Line11 from "test.Dialog";
import Default1, { Named1 } from "legacy.module";
import Default1, { Named1 } from "@new_module/file";
import Default1, {
    Named1,
} from "@new_module/file";
import Default2, * as Star1 from "test.Dialog";
import "test.Dialog";

import Line12  from "@test.Dialog"; //HELLO
import {Line13}  from "@test.Dialog" //HELLO


const test = `import { Line14, Notification } from "../src/Dialog";`

import Line15 from "test/Dialog";
import Line16 from "test.Dialog.error";
"""
        result = transpile_javascript("/test_assetsbundle/static/src/import.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/import', ['@test_assetsbundle/Dialog', 'Dialog', '@tests/Dialog', 'test.Dialog', 'test.Dialog2', 'legacy.module', '@new_module/file', '@test.Dialog', 'test/Dialog', 'test.Dialog.error'], function (require) {
'use strict';
let __exports = {};
/**
 * import { Dialog, Notification } from "../src/Dialog";
 */
const { Line1 } = require("@test_assetsbundle/Dialog");
const { Line2, Notification } = require("@test_assetsbundle/Dialog");
const { Line3, Notification } = require("Dialog");
const { Line4, Notification } = require("@tests/Dialog");
const { Line5, Notification } = require("@test_assetsbundle/Dialog");
const { Line6, Notification } = require("@test_assetsbundle/Dialog")
const Line7 = require("@test_assetsbundle/Dialog")[Symbol.for("default")];
const Line8 = require("@test_assetsbundle/Dialog")[Symbol.for("default")];

const Line9 = require("test.Dialog");
const { Line10, Notification } = require('test.Dialog2');

const Line11 = require("test.Dialog");
const Default1 = require("legacy.module");
const { Named1 } = Default1;
const { [Symbol.for("default")]: Default1, Named1 } = require("@new_module/file");
const { [Symbol.for("default")]: Default1,
    Named1,
} = require("@new_module/file");
const Star1 = require("test.Dialog");
const Default2 = Star1[Symbol.for("default")];
require("test.Dialog");

const Line12 = require("@test.Dialog")[Symbol.for("default")]; //HELLO
const {Line13} = require("@test.Dialog") //HELLO


const test = `import { Line14, Notification } from "../src/Dialog";`

const Line15 = require("test/Dialog");
const Line16 = require("test.Dialog.error");

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/import';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_07_index(self):
        input_content = """export const a = 5;

import * as b from "@tests/dir";

import c from "@tests/dir/index/";

import d from "@tests";"""
        result = transpile_javascript("/test_assetsbundle/static/src/index.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle', ['@tests/dir', '@tests'], function (require) {
'use strict';
let __exports = {};
const a = __exports.a = 5;

const b = require("@tests/dir");

const c = require("@tests/dir")[Symbol.for("default")];

const d = require("@tests")[Symbol.for("default")];
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_08_list(self):
        input_content = """export {a, b};

export {a as aa, b, c as cc};
export {a, aReallyVeryLongNameWithSomeExtra}
export {
        a,
        aReallyVeryLongNameWithSomeExtra,
        }
export {
        a,
        aReallyVeryLongNameWithSomeExtra
        }


export {a, aReallyVeryLongNameWithSomeExtra /* a comment must not cause catastrophic backtracking, even if not supported */};

export {c, d} from "@tests/Dialog";
export {e} from "../src/Dialog";

export {c as cc, d, e as ee} from "@tests/Dialog";

export * from "@tests/Dialog";
"""
        result = transpile_javascript("/test_assetsbundle/static/src/list.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/list', ['@tests/Dialog', '@test_assetsbundle/Dialog'], function (require) {
'use strict';
let __exports = {};
Object.assign(__exports, {a,  b});

Object.assign(__exports, {aa: a,  b, cc:  c});
Object.assign(__exports, {a,  aReallyVeryLongNameWithSomeExtra})
Object.assign(__exports, {
        a, 
        aReallyVeryLongNameWithSomeExtra, 
        })
Object.assign(__exports, {
        a, 
        aReallyVeryLongNameWithSomeExtra
        })


export {a, aReallyVeryLongNameWithSomeExtra /* a comment must not cause catastrophic backtracking, even if not supported */};

{const {c, d} = require("@tests/Dialog");Object.assign(__exports, {c,  d})};
{const {e} = require("@test_assetsbundle/Dialog");Object.assign(__exports, {e})};

{const {c, d, e} = require("@tests/Dialog");Object.assign(__exports, {cc: c,  d, ee:  e})};

Object.assign(__exports, require("@tests/Dialog"));

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/list';
return __exports;
});
"""

        self.assertEqual(result, expected_result)


    def test_09_variables(self):
        input_content = """export const v = 5;

const a = 12;
const $b = 15;

export { a, $b };

export default 100;

export default a;
"""
        result = transpile_javascript("/test_assetsbundle/static/src/variables.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/variables', [], function (require) {
'use strict';
let __exports = {};
const v = __exports.v = 5;

const a = 12;
const $b = 15;

Object.assign(__exports, { a,  $b });

__exports[Symbol.for("default")] = 100;

__exports[Symbol.for("default")] = a;

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/variables';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_10_qunit_module_test(self):
        input_content = """QUnit.test("Tests", function (assert) {{}})"""

        result = transpile_javascript("/test_assetsbundle/static/tests/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/../tests/alias', [], function (require) {
'use strict';
let __exports = {};
QUnit.module("test_assetsbundle", function() {QUnit.test("Tests", function (assert) {{}})});
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/../tests/alias';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_11_qunit_module_debug(self):
        input_content = """QUnit.debug("Tests", function (assert) {{}})"""

        result = transpile_javascript("/test_assetsbundle/static/tests/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/../tests/alias', [], function (require) {
'use strict';
let __exports = {};
QUnit.module("test_assetsbundle", function() {QUnit.debug("Tests", function (assert) {{}})});
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/../tests/alias';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_12_qunit_no_module(self):
        input_content = """let a = 1 + 1;"""

        result = transpile_javascript("/test_assetsbundle/static/tests/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/../tests/alias', [], function (require) {
'use strict';
let __exports = {};
let a = 1 + 1;
for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/../tests/alias';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_13_require_comment(self):
        input_content = """
require("@test/Dialog")
const dialog = require("@test/Dialog2")

// require("@test/Comment")
// const comment = require("@test/Comment")

/*require("@test/Comment")*/
/* const comment = require("@test/Comment") */

/**
*require("@test/Comment")
*/
/**
* const comment = require("@test/Comment")
*/
"""

        result = transpile_javascript("/test_assetsbundle/static/src/alias.js", input_content)

        expected_result = """odoo.define('@test_assetsbundle/alias', ['@test/Dialog', '@test/Dialog2'], function (require) {
'use strict';
let __exports = {};

require("@test/Dialog")
const dialog = require("@test/Dialog2")

// require("@test/Comment")
// const comment = require("@test/Comment")

/*require("@test/Comment")*/
/* const comment = require("@test/Comment") */

/**
*require("@test/Comment")
*/
/**
* const comment = require("@test/Comment")
*/

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/alias';
return __exports;
});
"""

        self.assertEqual(result, expected_result)

    def test_14_unnamed_import(self):
        input_content = """
// first line

import "@test_assetsbundle/some_file";
"""

        result = transpile_javascript("/test_assetsbundle/static/src/a.js", input_content)
        expected_result = """odoo.define('@test_assetsbundle/a', ['@test_assetsbundle/some_file'], function (require) {
'use strict';
let __exports = {};

// first line

require("@test_assetsbundle/some_file");

for (const __k in __exports) if (typeof __exports[__k] === "function") __exports[__k].___filename = '@test_assetsbundle/a';
return __exports;
});
"""
        self.assertEqual(result, expected_result)

    def test_15_xml_tagged_template_single(self):
        result = convert_xml_tagged_template("@web/core/component", 'const tmpl = xml`<div>hello</div>`;')
        self.assertEqual(result, 'const tmpl = xml.withSourceId("xml-@web/core/component:1")`<div>hello</div>`;')

    def test_16_xml_tagged_template_multiple(self):
        content = 'const a = xml`<div/>`;\nconst b = xml`<span/>`;'
        result = convert_xml_tagged_template("@web/views/list", content)
        self.assertEqual(result, 'const a = xml.withSourceId("xml-@web/views/list:1")`<div/>`;\nconst b = xml.withSourceId("xml-@web/views/list:2")`<span/>`;')

    def test_17_xml_tagged_template_interpolation(self):
        result = convert_xml_tagged_template("@web/core/tmpl", 'xml`<t t-name="${name}"/>`')
        self.assertEqual(result, 'xml.withSourceId("xml-@web/core/tmpl:1")`<t t-name="${name}"/>`')

    def test_18_xml_tagged_template_dotxml(self):
        content = 'owl.xml`<div/>`;'
        result = convert_xml_tagged_template("@web/core/x", content)
        self.assertEqual(result, 'owl.xml.withSourceId("xml-@web/core/x:1")`<div/>`;')

    def test_18b_xml_tagged_template_no_match_suffixed(self):
        content = 'escapeXml`test`;'
        result = convert_xml_tagged_template("@web/core/x", content)
        self.assertEqual(result, content)

    def test_19_xml_tagged_template_skip_local_redefine(self):
        content = 'function xml(s) { return s.trim(); }\nxml`<div/>`;'
        result = convert_xml_tagged_template("@web/hoot/value", content)
        self.assertEqual(result, content)

    def test_20_xml_tagged_template_noop(self):
        content = 'const x = 1 + 2;'
        result = convert_xml_tagged_template("@web/core/utils", content)
        self.assertEqual(result, content)
