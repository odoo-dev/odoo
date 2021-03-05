/** @odoo-module **/
const { Component } = owl;
const keyboardEventBubble = (args) =>
  Object.assign({}, args, { bubbles: true, keyCode: args.which });
const mouseEventMapping = (args) =>
  Object.assign({}, args, {
    bubbles: true,
    cancelable: true,
    clientX: args ? args.pageX : undefined,
    clientY: args ? args.pageY : undefined,
    view: window,
  });
const mouseEventNoBubble = (args) =>
  Object.assign({}, args, {
    bubbles: false,
    cancelable: false,
    clientX: args ? args.pageX : undefined,
    clientY: args ? args.pageY : undefined,
    view: window,
  });
const noBubble = (args) => Object.assign({}, args, { bubbles: false });
const onlyBubble = (args) => Object.assign({}, args, { bubbles: true });
// TriggerEvent constructor/args processor mapping
const EVENT_TYPES = {
  auxclick: { constructor: MouseEvent, processParameters: mouseEventMapping },
  click: { constructor: MouseEvent, processParameters: mouseEventMapping },
  contextmenu: { constructor: MouseEvent, processParameters: mouseEventMapping },
  dblclick: { constructor: MouseEvent, processParameters: mouseEventMapping },
  mousedown: { constructor: MouseEvent, processParameters: mouseEventMapping },
  mouseup: { constructor: MouseEvent, processParameters: mouseEventMapping },
  mousemove: { constructor: MouseEvent, processParameters: mouseEventMapping },
  mouseenter: { constructor: MouseEvent, processParameters: mouseEventNoBubble },
  mouseleave: { constructor: MouseEvent, processParameters: mouseEventNoBubble },
  mouseover: { constructor: MouseEvent, processParameters: mouseEventMapping },
  mouseout: { constructor: MouseEvent, processParameters: mouseEventMapping },
  focus: { constructor: FocusEvent, processParameters: noBubble },
  focusin: { constructor: FocusEvent, processParameters: onlyBubble },
  blur: { constructor: FocusEvent, processParameters: noBubble },
  cut: { constructor: ClipboardEvent, processParameters: onlyBubble },
  copy: { constructor: ClipboardEvent, processParameters: onlyBubble },
  paste: { constructor: ClipboardEvent, processParameters: onlyBubble },
  keydown: { constructor: KeyboardEvent, processParameters: keyboardEventBubble },
  keypress: { constructor: KeyboardEvent, processParameters: keyboardEventBubble },
  keyup: { constructor: KeyboardEvent, processParameters: keyboardEventBubble },
  drag: { constructor: DragEvent, processParameters: onlyBubble },
  dragend: { constructor: DragEvent, processParameters: onlyBubble },
  dragenter: { constructor: DragEvent, processParameters: onlyBubble },
  dragstart: { constructor: DragEvent, processParameters: onlyBubble },
  dragleave: { constructor: DragEvent, processParameters: onlyBubble },
  dragover: { constructor: DragEvent, processParameters: onlyBubble },
  drop: { constructor: DragEvent, processParameters: onlyBubble },
  input: { constructor: InputEvent, processParameters: onlyBubble },
  compositionstart: { constructor: CompositionEvent, processParameters: onlyBubble },
  compositionend: { constructor: CompositionEvent, processParameters: onlyBubble },
};
export function getNode(target) {
  let nodes;
  if (target instanceof Component) {
    nodes = [target.el];
  } else if (typeof target === "string") {
    nodes = [...document.querySelectorAll(target)];
  } else {
    nodes = [target];
  }
  if (nodes.length !== 1) {
    throw new Error(`Found ${nodes.length} nodes instead of 1.`);
  }
  const node = nodes[0];
  if (!node) {
    throw new Error(`Expected a node and got ${node}.`);
  }
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Expected an HTMLElement.`);
  }
  return node;
}
export function findItem(el, selector, elFinder = 0) {
  const elements = [];
  for (const elem of [...getNode(el).querySelectorAll(selector)]) {
    if (elem instanceof HTMLElement) {
      elements.push(elem);
    }
  }
  if (!elements.length) {
    throw new Error(`No element found with selector "${selector}".`);
  }
  switch (typeof elFinder) {
    case "number": {
      const match = elements[elFinder];
      if (!match) {
        throw new Error(`No element with selector "${selector}" at index ${elFinder}.`);
      }
      return match;
    }
    case "string": {
      const match = elements.find(
        (el) => el.innerText.trim().toLowerCase() === elFinder.toLowerCase()
      );
      if (!match) {
        throw new Error(`No element with selector "${selector}" containing "${elFinder}".
                `);
      }
      return match;
    }
    default:
      throw new Error(`Invalid provided element finder: must be a number|string|function.`);
  }
}
async function returnAfterNextAnimationFrame() {
  await new Promise((resolve) => setTimeout(resolve));
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}
/**
 * Trigger an event on the specified target.
 * This function will dispatch a native event to an EventTarget or a
 * jQuery event to a jQuery object. This behaviour can be overridden by the
 * jquery option.
 *
 * @param {AdmissibleTarget} el
 * @param {string} eventType event type
 * @param {Object} [eventAttrs] event attributes
 *   on a jQuery element with the `$.fn.trigger` function
 * @returns {Promise}
 */
export async function triggerEvent(el, eventType, eventAttrs = {}) {
  let event;
  if (eventType in EVENT_TYPES) {
    const { constructor, processParameters } = EVENT_TYPES[eventType];
    event = new constructor(eventType, processParameters(eventAttrs));
  } else {
    event = new Event(eventType, Object.assign({}, eventAttrs, { bubbles: true }));
  }
  const target = getNode(el);
  target.dispatchEvent(event);
  await returnAfterNextAnimationFrame();
}
/**
 * Trigger multiple events on the specified element.
 *
 * @param {AdmissibleTarget} el
 * @param {string[]} events the events you want to trigger
 * @returns {Promise}
 */
export async function triggerEvents(el, events) {
  for (let e = 0; e < events.length; e++) {
    await triggerEvent(el, events[e]);
  }
}
