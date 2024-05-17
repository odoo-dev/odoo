/** @odoo-module */

// Format commands
export function bold(editor) {
    editor.dispatch("FORMAT_BOLD");
}

export function italic(editor) {
    editor.dispatch("FORMAT_ITALIC");
}

export function underline(editor) {
    editor.dispatch("FORMAT_UNDERLINE");
}

export function strikeThrough(editor) {
    editor.dispatch("FORMAT_STRIKETHROUGH");
}

export function setFontSize(size) {
    return (editor) => editor.dispatch("FORMAT_FONT_SIZE", size);
}

export function switchDirection(editor) {
    console.log("should dispatch FORMAT_SWITCH_DIRECTION");
    //editor.execCommand('switchDirection')}
}

// helpers to generate html tags
const getZwsTag = (tagName, { style } = {}) => {
    const styleAttr = style ? ` style="${style}"` : "";
    return (content, zws) => {
        const zwsFirstAttr = zws === "first" ? ' data-oe-zws-empty-inline=""' : "";
        const zwsLastAttr = zws === "last" ? ' data-oe-zws-empty-inline=""' : "";
        return `<${tagName}${zwsFirstAttr}${styleAttr}${zwsLastAttr}>${content}</${tagName}>`;
    };
};

export const span = getZwsTag("span");

export const strong = getZwsTag("strong");
export const notStrong = getZwsTag("span", { style: "font-weight: normal;" });
export const spanBold = getZwsTag("span", { style: "font-weight: bolder;" });
export const b = getZwsTag("b");

export const BOLD_TAGS = [strong, spanBold, b];

export const em = getZwsTag("em");

export const u = getZwsTag("u");

export const s = getZwsTag("s");
