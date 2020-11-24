export default [{
  input: "static/dist/js/src/main.js",
  external: ["@odoo/owl"],
  output: {
    file: "static/dist/app.js",
    format: "iife",
    name: "wowl",
    extend: true,
    globals: { "@odoo/owl": "owl" },
  },
}, {
  input: "static/dist/js/tests/main.js",
  external: ["@odoo/owl", "qunit", "jquery"],
  output: {
    file: "static/dist/app_tests.js",
    format: "iife",
    name: "wowl",
    extend: true,
    globals: { "@odoo/owl": "owl", "qunit": "QUnit", "jquery": "$" },
    interop: false, // to be allowed to add a 'debug' function on the QUnit object
  },
}];
