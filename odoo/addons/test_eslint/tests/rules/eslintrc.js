module.exports = {
    "env": {
        "commonjs": true,
        "es6": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "sourceType": "module"
    },
    "rules": {
        "indent": [
            "off",
            4,
            {
                "SwitchCase": 1
            }
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "off",
            "double"
        ],
        "semi": [
            "error",
            "always"
        ],
        "comma-dangle": [
            "off"
        ],
        "no-console": [
            "warn",
            {
                "allow": ["warn", "error"]
            }
        ],
        "no-unused-vars": [
            "warn",
            {
                "args": "none"
            }
        ],
        "no-empty": [
            "warn"
        ],
        "eqeqeq": [
            "error",
            "smart"
        ],
        "space-before-function-paren": [
            "warn",
            {"anonymous": "always", "named": "never"}
        ],
        "keyword-spacing": [
            "warn"
        ],
        "no-use-before-define": [
            "warn",
            "nofunc"
        ]
    },
    "globals": {
        "$": false,
        "jQuery": false,
        "_": false,
        "openerp": true,
        "odoo": true,
        "CKEDITOR": true,
        "google": false,
        "window": false,
        "setTimeout": false,
        "clearTimeout": false,
        "document": false,
        "console": false,
        "QUnit": false,
        "moment": false,
        "FileReader": false,
        "nv": false,
        "d3": false,
        "ace": false,
        "Option": false,
        "py": false,
        "XMLHttpRequest": false,
        "setTimeout": false,
        "clearTimeout": false,
        "setInterval": false,
        "clearInterval": false,
        "Image": false,
        "jstz": false,
        "ZeroClipboard": false,
        "sessionStorage": false,
        "Node": false,
        "history": false,
        "gapi": false,
        "Event": false,
        "Gravitec": false,
        "navigator": false,
        "OneSignal": false
    }
}