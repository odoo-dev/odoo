// @odoo-module ignore

// the python bridge callback doesn't take any argument,
// so we use global variables to pass the argument and get
// the result back.
// This is a hack to avoid writing ctypes, but it's simple and works.

globalThis.__python_ret = "";
globalThis.__python_arg = "";

function callPython(payload) {
    globalThis.__python_arg = payload;

    __internal_callPython();

    const result = globalThis.__python_ret;
    globalThis.__python_ret = "";
    globalThis.__python_arg = "";
    return result;
}

globalThis.callPython = callPython;
