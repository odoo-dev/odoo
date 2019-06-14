(function () {
'use strict';

var rangeCollapsed = '\u25C6'; // ◆
var rangeStart = '\u25B6'; // ▶
var rangeEnd = '\u25C0'; // ◀

var regExpRange = new RegExp('(' + rangeStart + '|' + rangeEnd + '|' + rangeCollapsed + ')', 'g');
var regExpRangeToCollapsed = new RegExp(rangeStart + rangeEnd, 'g');
var other = '[^' + rangeStart + '' + rangeEnd + ']*';
var regExpRangeCollapsed = new RegExp('^(' + other + ')(' + rangeCollapsed + ')(' + other + ')$');
var regExpRangeNotCollapsed = new RegExp('^(' + other + ')(' + rangeStart + ')?(' + other + ')(' + rangeEnd + ')?(' + other + ')$');
var regSpace = /\u00A0/g;
var regInvisible = /\uFEFF/g;

/////////////////////////////////////////////////////////////////

var VIRTUAL = we3.getArchNode('TEXT-VIRTUAL');
var TEST = class extends VIRTUAL {
    //--------------------------------------------------------------------------
    // static
    //--------------------------------------------------------------------------

    static parse (archNode) {
        if (TEST._isTestingVirtualNode(archNode)) {
            return TEST._createTestingVirtualNode(archNode);
        }
    }
    static _createTestingVirtualNode (archNode) {
        if (archNode.type === 'TEST') {
            return;
        }
        var childNodes = [];
        var matches = archNode.nodeValue.match(regExpRangeCollapsed) || archNode.nodeValue.match(regExpRangeNotCollapsed);
        if (matches) {
            var fragment = new we3.ArchNodeFragment(archNode.params);
            matches.shift();
            matches.forEach(function (match) {
                if (match === rangeCollapsed) {
                    fragment.append(new TEST(archNode.params, null, null, rangeStart));
                    fragment.append(new TEST(archNode.params, null, null, rangeEnd));
                } else if (match && match.length) {
                    if (match === rangeStart || match === rangeEnd) {
                        fragment.append(new TEST(archNode.params, null, null, match));
                    } else {
                        fragment.append(new we3.ArchNodeText(archNode.params, null, null, match));
                    }
                }
            });
            return fragment;
        }
    }
    static _isTestingVirtualNode (archNode) {
        return archNode.nodeValue && regExpRange.test(archNode.nodeValue);
    }

    //--------------------------------------------------------------------------
    // public
    //--------------------------------------------------------------------------

    constructor (params, nodeName, attributes, nodeValue) {
        super(...arguments)
        this.nodeValue = nodeValue;
    }
    isVisibleText () {
        return true;
    }
    isTestNode () {
        return true;
    }
    toString (options) {
        return this.nodeValue;
    }
    get type () {
        return 'TEST';
    }

    //--------------------------------------------------------------------------
    // private
    //--------------------------------------------------------------------------

    _applyRulesArchNode () {}
};
we3.addArchNode('TEST', TEST);

/////////////////////////////////////////////////////////////////

function deepEqual (v1, v2) {
    if (v1 === v2) {
        return true;
    }
    if (typeof v1 === 'object' && typeof v2 === 'object') {
        var k1 = Object.keys(v1);
        var k2 = Object.keys(v2);
        if (k1.length !== k2.length) {
            return false;
        }
        for (var i = 0; i < k1.length; i++) {
            var key = k1[i];
            if (!deepEqual(v1[key], v2[key])) {
                return false;
            }
        }
        return true;
    }
}
function log (result, testName, value) {
    if (testName.startsWith('<')) {
        console.info('%cTEST: ' + testName, 'background-color: grey; color: black; padding: 2px;');
    } else if (result === true) {
        console.info('%cTEST: ' + testName, 'color: green;');
    } else if (result === false) {
        console.error('TEST: ', testName, '=>', value);
    }
}
/**
 * Get the event type based on its name.
 *
 * @private
 * @param {string} eventName
 * @returns string
 *  'mouse' | 'keyboard' | 'unknown'
 */
function _eventType(eventName) {
    var types = {
        mouse: ['click', 'mouse', 'pointer', 'contextmenu', 'select', 'wheel'],
        keyboard: ['key'],
    };
    var type = 'unknown';
    Object.keys(types).forEach(function (key, index) {
        var isType = types[key].some(function (str) {
            return eventName.indexOf(str) !== -1;
        });
        if (isType) {
            type = key;
        }
    });
    return type;
}


var TestPlugin = class extends we3.AbstractPlugin {
    /**
     *@param {Object} options
     *@param {Object} options.test
     *@param {boolean} options.test.auto start automatically all tests
     *@param {Object} options.test.assert
     *@param {function} options.test.assert.ok
     *@param {function} options.test.assert.notOk
     *@param {function} options.test.assert.strictEqual
     *@param {function} options.test.assert.deepEqual
     *@param {function} options.test.callback called at the test ending
     **/
    constructor (parent, params, options) {
        super(...arguments)
        var self = this;
        this.dependencies = ['Arch', 'Range', 'Rules'];

        this.templatesDependencies = ['xml/test.xml'];
        this.buttons = {
            template: 'we3.buttons.test',
        };

        this._plugins = [this];
        this._allPluginsAreReady = false;
        this._complete = false;


        this.nTests = 0;
        this.nOKTests = 0;

        var assert = this.assert = {
            ok (value, testName) {
                self.nTests++;
                var didPass = !!value;
                if (self.options.test && self.options.test.assert) {
                    self.options.test.assert.ok(value, testName);
                } else {
                    log(didPass, testName, value);
                }
                if (didPass) {
                    self.nOKTests++;
                }
            },
            notOk (value, testName) {
                self.nTests++;
                var didPass = !value;
                if (self.options.test && self.options.test.assert) {
                    self.options.test.assert.notOk(value, testName);
                } else {
                    log(didPass, testName, value);
                }
                if (didPass) {
                    self.nOKTests++;
                }
            },
            strictEqual (value, expectedValue, testName) {
                self.nTests++;
                var didPass = value === expectedValue;
                if (self.options.test && self.options.test.assert) {
                    self.options.test.assert.strictEqual(value, expectedValue, testName);
                } else {
                    log(didPass, testName, value);
                }
                if (didPass) {
                    self.nOKTests++;
                }
            },
            deepEqual (value, expectedValue, testName) {
                self.nTests++;
                var didPass = deepEqual(value, expectedValue);
                if (self.options.test && self.options.test.assert) {
                    self.options.test.assert.deepEqual(value, expectedValue, testName);
                } else {
                    log(didPass, testName, value);
                }
                if (didPass) {
                    self.nOKTests++;
                }
            },
        };
    }
    start () {
        var promise = super.start();
        this.dependencies.Rules.addStructureRule({
            nodes: {
                methods: ['isTestNode'],
            },
            permittedParents: {
                methods: ['isTrue'],
            },
        });
        return promise;
    }
    setEditorValue () {
        if (this._allPluginsAreReady) {
            return;
        }
        this._allPluginsAreReady = true;

        if (this.buttons.elements) {
            var dropdown = this.buttons.elements[0].querySelector("we3-vertical-items");
            this._plugins.forEach(function (plugin) {
                var button = document.createElement('we3-button');
                button.setAttribute('data-method', 'loadTest');
                button.setAttribute('data-value', plugin.pluginName);
                button.innerHTML = plugin.pluginName + '&nbsp;';
                button.appendChild(document.createElement('small'));
                dropdown.appendChild(button);
            });
        }

        if (this.options.test && this.options.test.auto) {
            setTimeout(this._loadTests.bind(this));
        }
    }
    destroy () {
        if (this.options.test && this.options.test.auto) {
            if (!this._complete) {
                this.assert.notOk(true, "The editor are destroyed before all tests are complete");
                this._terminate();
            } else {
                this.assert.ok(true, "The plugin 'Test' are destroyed");
            }
        }
        super.destroy();
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Add a test plugin.
     *
     * @param {Plugin} plugin
     */
    add (plugin) {
        this._plugins.push(plugin);
    }
    async click (target, DOMRangeOffset) {
        var self = this;
        var node = !target || target.tagName ? target : target.parentNode;
        if (!node) {
            return;
        }
        return this.triggerNativeEvents(node, 'mousedown').then(function (ev) {
            if (!ev.defaultPrevented) {
                self._selectRange(target, DOMRangeOffset|0);
            }
            return self.triggerNativeEvents(node, 'click').then(function () {
                return self.triggerNativeEvents(node, 'mouseup');
            });
        });
    }
    /**
     * Execute tests.
     *
     * @param {Object} assert
     * @param {Object []} tests
     * @returns {Promise}
     */
    async execTests (assert, tests) {
        var self = this;
        var defPollTest = Promise.resolve();
        tests.forEach((test) => defPollTest = defPollTest.then(this._pollTest.bind(this, this.assert, test)));
        return defPollTest;
    }
    getValue () {
        var params = this.dependencies.Arch.getNode(1).params; // TODO: Remove hardcoded 1 (=> apply customRules on parsing !, and after changes)
        var range = this.dependencies.Range.getRange();
        var archNode;
        if (range.isCollapsed()) {
            archNode = new TEST(params, null, null, rangeCollapsed);
            this.dependencies.Arch.insert(archNode);
        } else {
            archNode = new TEST(params, null, null, rangeEnd);
            this.dependencies.Arch.insert(archNode, range.ec, range.eo);
            archNode = new TEST(params, null, null, rangeStart);
            this.dependencies.Arch.insert(archNode, range.sc, range.so);
        }
        var result = this.dependencies.Arch.getValue()
            .replace(regExpRangeToCollapsed, rangeCollapsed)
            .replace(regSpace, '&nbsp;')
            .replace(regInvisible, '&#65279;');
        return result;
    }
    /**
     * Trigger a keydown event on the target.
     *
     * @param {Node} target
     * @param {Object} keyPress
     * @returns {Node} target
     */
    async keydown (target, keyPress) {
        var self = this;
        target = target.tagName ? target : target.parentNode;
        if (!keyPress.keyCode) {
            for (var keyCode in this.utils.keyboardMap) {
                if (this.utils.keyboardMap[keyCode] === keyPress.key) {
                    keyPress.keyCode = +keyCode;
                    break;
                }
            }
        } else {
            keyPress.key = this.utils.keyboardMap[keyPress.keyCode] || String.fromCharCode(keyPress.keyCode);
        }
        keyPress.keyCode = keyPress.keyCode;
        await this.triggerNativeEvents(target, 'keydown', keyPress).then(function (ev) {
            ev = ev[0] || ev; // (only one event was triggered)
            if (!ev.defaultPrevented) {
                if (keyPress.key.length === 1) {
                    self._textInput(target, keyPress.key);
                    document.execCommand("insertText", 0, keyPress.key);
                } else {
                    console.debug('Native "' + keyPress.key + '" is not supported in test');
                }
            }
        });
        await this.triggerNativeEvents(target, 'keyup', keyPress);
        return target;
    }
    /**
     * Load a test.
     *
     * @private
     * @param {Plugin} plugin
     * @returns {Promise}
     */
    async loadTest (pluginName) {
        if (this.isDestroyed()) {
            return;
        }
        if (pluginName) {
            var plugin = pluginName && this._plugins.find(function (plugin) {
                return plugin.pluginName === pluginName;
            });
            await this._loadTest(plugin);
        } else {
            await this._loadTests();
        }
    }
    /**
     * Set the range in the editor and make sure to focus the editor.
     *
     * @param {Object} range
     */
    setRange (range) {
        this.dependencies.Range.setRange(range);
        var newRange = this.dependencies.Range.getRange();
        this.triggerNativeEvents(newRange.sc, ['focus']);
    }
    /**
     * Set the editor's value.
     *
     * @param {string} value
     */
    setValue (value) {
        if (this.isDestroyed()) {
            return;
        }
        var self = this;
        this.triggerUp('set_value', {value: value});

        var clone = this.dependencies.Arch.getNode(1);
        var options = {
            doCrossUnbreakables: true,
        };
        var start = clone.nextUntil(function (a) { return a.type === 'TEST'; }, options);
        var end = start ? start.nextUntil(function (a) { return a.type === 'TEST'; }, options) : null;

        this.triggerUp('set_value', {value: value.replace(regExpRange, '')});

        var range;
        if (!start) {
            range = {
                scID: 1,
                so: 0,
                ecID: 1,
                eo: 0,
            };
        } else {
            var archNode = this.dependencies.Arch.getNode(1);
            function __getPoint(o, isEnd) {
                var offset = 0;
                var path = o.path();

                // Correct path and offset for insertion of range symbol
                var prev = o.previousSibling();
                if (prev && prev.isText()) {
                    // account for splitting of text node to insert range symbol
                    var prevPrev = prev && prev.previousSibling();
                    if (!prev.isTestNode) {
                        path[path.length - 1]--;
                        offset += prev.length();
                    } else if (prev.isTestNode && prev.isTestNode() && prevPrev && prevPrev.isText()) {
                        path[path.length - 1]--;
                        offset += prevPrev.length();
                    }
                    var prevPrevPrev = prevPrev && prevPrev.previousSibling();
                    if (prevPrev && prevPrev.isTestNode && prevPrevPrev && prevPrevPrev.isText()) {
                        offset += prevPrevPrev.length();
                    }
                }
                if (isEnd && start.parent.id === o.parent.id) {
                    // account for splitting of text node to insert start range symbol,
                    // and for range symbol itself
                    path[path.length - 1]--;
                    var startPrev = start.previousSibling();
                    var startNext = start.nextSibling();
                    if (startPrev && startPrev.isText() && startNext && startNext.isText() && startNext.id !== o.id) {
                        path[path.length - 1]--;
                    }
                }

                var arch = archNode.applyPath(path.slice());
                if (!arch) {
                    offset = path[path.length - 1];
                    arch = archNode.applyPath(path.slice(0, -1));
                }
                return {
                    node: arch,
                    offset: offset,
                };
            }
            var s = __getPoint(start, false);
            var e = __getPoint(end, true);

            range = {
                scID: s.node.id,
                so: s.offset,
                ecID: e.node.id,
                eo: e.offset,
            };
        }
        this.setRange(range);
    }
    /**
     * Test autoinstall.
     *
     * @param {Object} assert
     * @returns {Promise}
     */
    async test (assert) {
        var test = false;
        this._plugins.forEach(function (plugin) {
            if (plugin.pluginName === 'TestAutoInstall') {
                test = true;
            }
        });
        assert.ok(test, 'Should find "TestAutoInstall" plugin');
        return Promise.resolve();
    }
    /**
     * Trigger events natively on the specified target.
     *
     * @param {node} el
     * @param {string []} events
     * @param {object} [options]
     * @returns {Promise <Event []>}
     */
    async triggerNativeEvents (el, events, options) {
        var self = this;
        el = el.tagName ? el : el.parentNode;
        options = _.defaults(options || {}, {
            view: window,
            bubbles: true,
            cancelable: true,
        });
        var isMulti = true;
        if (typeof events === 'string') {
            isMulti = false;
            events = [events];
        }
        var triggeredEvents = []
        events.forEach(function (eventName) {
            var event;
            switch (_eventType(eventName)) {
                case 'mouse':
                    event = new MouseEvent(eventName, options);
                    break;
                case 'keyboard':
                    event = new KeyboardEvent(eventName, options);
                    break;
                default:
                    event = new Event(eventName, options);
                    break;
            }

            var onerror = window.onerror;
            window.onerror = function (e) {
                window.onerror = onerror;
                console.error(e);
                self.assert.notOk(e, 'ERROR Event: ' + eventName);
            }
            el.dispatchEvent(event);
            window.onerror = onerror;

            triggeredEvents.push(event);
        });
        return new Promise(function (resolve) {
            setTimeout(function (argument) {
                resolve(isMulti ? triggeredEvents : triggeredEvents[0]);
            }, 0);
        });
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Exec a test's value test.
     *
     * @private
     * @param {Object} assert
     * @param {Object} test
     * @returns {Boolean}
     */
    _execAssert (assert, test) {
        if (test.test) {
            var value = this.getValue();
            if (assert.strictEqual(value, test.test, test.name)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Return true if the node being tested is virtual.
     *
     * @private
     * @param {JSON} json
     * @returns {Boolean}
     */
    _isTestingVirtualNode (json) {
        return regExpRange.test(json.nodeValue);
    }
    /**
     * Load a test.
     *
     * @private
     * @param {Plugin} plugin
     * @returns {Promise}
     */
    async _loadTest (plugin) {
        if (this.isDestroyed()) {
            return Promise.resolve();
        }
        if (typeof plugin === 'string') {
            plugin = this._plugins.find(function (p) {
                return p.pluginName === plugin;
            });
        }

        this._testPluginActive = plugin;
        this.triggerUp('set_value', {value: ''});
        this.assert.ok(true, '<' + plugin.pluginName + '>');

        this.nTests = 0;
        this.nOKTests = 0;

        try {
            var promise = Promise.all([plugin.test(this.assert)]);
        } catch (e) {
            this.assert.notOk(e, 'ERROR');
            var promise = Promise.resolve();
        }
        return promise.then(this._logFinalResult.bind(this));
    }
    /**
     * Load all tests.
     *
     * @private
     */
    async _loadTests () {
        for (var k = 0; k < this._plugins.length; k++) {
            await this._loadTest(this._plugins[k]);
        }
        return this._terminate();
    }
    /**
     * Log the final result of a series of tests.
     *
     * @private
     */
    _logFinalResult () {
        var nTests = this.nTests;
        var nOKTests = this.nOKTests;
        var button;
        if (this.buttons.elements) {
            button = this.buttons.elements[0].querySelector('we3-button[data-value="' + this._testPluginActive.pluginName + '"]');
        }

        if (nTests - nOKTests === 0) {
            var css = 'background-color: green; color: white;';
            console.info('%cAll ' + nTests + ' tests OK.', css);

            if (button) {
                button.style.backgroundColor = '#ccffcc';
                button.lastChild.innerHTML = '(' + nTests + ')';
            }
        } else {
            console.warn('Result: ' + nOKTests + '/' + nTests + ' passed. ' + (nTests - nOKTests) + ' to go.');

            if (button) {
                button.style.backgroundColor = '#ffcccc';
                button.lastChild.innerHTML = '(' + nOKTests + '/' + nTests + ')';
            }
        }
    }
    /**
     * Execute an individual test.
     *
     * @private
     * @param {Object} assert
     * @param {Object} test
     * @returns {Promise|Boolean}
     */
    async _pollTest (assert, test) {
        this.setValue(test.content);
        if (test.do) {
            await test.do(assert, test.name);
        }
        return this._execAssert(assert, test);
    }
    /**
     * Select the given collapsed range in the DOM.
     *
     * @private
     * @param {Node} sc
     * @param {offset} so
     */
    _selectRange (sc, so) {
        var nativeRange = sc.ownerDocument.createRange();
        nativeRange.setStart(sc, so);
        nativeRange.setEnd(sc, so);
        var selection = sc.ownerDocument.getSelection();
        if (selection.rangeCount > 0) {
            selection.removeAllRanges();
        }
        selection.addRange(nativeRange);
    }
    /**
     * Terminate testing.
     *
     * @private
     */
    _terminate () {
        this._complete = true;
        if (this.options.test && this.options.test.callback) {
            this.options.test.callback(this._results);
        }
    }
    /**
     * Trigger a `textInput` event on `target`.
     *
     * @private
     * @param {Node} target
     * @param {string} char
     */
    _textInput (target, char) {
        var ev = new CustomEvent('textInput', {
            bubbles: true,
            cancelBubble: false,
            cancelable: true,
            composed: true,
            data: char,
            defaultPrevented: false,
            detail: 0,
            eventPhase: 3,
            isTrusted: true,
            returnValue: true,
            sourceCapabilities: null,
            type: "textInput",
            which: 0,
        });
        ev.data = char;
        target.dispatchEvent(ev);

         if (!ev.defaultPrevented) {
            document.execCommand("insertText", 0, ev.data);
        }
    }
};


var TestAutoInstall = class extends we3.AbstractPlugin {
    static get autoInstall () {
        return ['Test'];
    }
    constructor () {
        super(...arguments);
        this.dependencies = ['Test'];
    }
    start () {
        this.dependencies.Test.add(this);
        return super.start();
    }
    test () {
        return Promise.resolve();
    }
};


we3.addPlugin('Test', TestPlugin);
we3.addPlugin('TestAutoInstall', TestAutoInstall);

})();
