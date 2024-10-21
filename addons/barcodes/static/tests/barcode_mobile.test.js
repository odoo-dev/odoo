import { beforeEach, expect, mountOnFixture, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { contains, mockService } from "@web/../tests/web_test_helpers";
import { keyDown } from "@odoo/hoot-dom";

beforeEach(() => {
    mockService("barcode", {
        maxTimeBetweenKeysInMs: 0,
        isMobileChrome: true,
    });
});

test('barcode field automatically focus behavior', async () => {
    assert.expect(10);
    await mountOnFixture(/* xml */ `
    <form>
        <input name="email" type="email"/>
        <input name="number" type="number"/>
        <input name="password" type="password"/>
        <input name="tel" type="tel"/>
        <input name="text"/>
        <input name="explicit_text" type="text"/>
        <textarea/>
        <div contenteditable="true"/>
        <select name="select">
            <option value="option1">Option 1</option>
            <option value="option2">Option 2</option>
        </select>
    </form>`);

    // Some elements doesn't need to keep the focus
    await keyDown("a");
    await animationFrame();
    expect(document.activeElement.name).toBe("barcode", {message: "hidden barcode input should have the focus"});

    await contains("select", { setFocus: true });
    await keyDown("b");
    await animationFrame();
    expect(document.activeElement.name).toBe("barcode", {message: "hidden barcode input should have the focus"});


    // Those elements absolutely need to keep the focus:
    // inputs elements:
    const keepFocusedElements = ['email', 'number', 'password', 'tel', 'text', 'explicit_text'];
    for (let i = 0; i < keepFocusedElements.length; ++i) {
        await contains(`input[name=${keepFocusedElements[i]}]`, {setFocus: true});
        await keyDown("c");
        await animationFrame();
        expect(`input[name=${keepFocusedElements[i]}]`).toBe(document.activeElement,
            {message: `input ${keepFocusedElements[i]} should keep focus`});
    }
    // textarea element
    await contains(`textarea`, {setFocus: true});
    await keyDown("d");
    await animationFrame();
    expect(`textarea`).toBe(document.activeElement, {message: "textarea should keep focus"});
    // contenteditable elements
    await contains(`[contenteditable=true]`, {setFocus: true});
    await keyDown("e");
    await animationFrame();
    expect(`[contenteditable=true]`).toBe(document.activeElement, {message: "contenteditable should keep focus"});
});
