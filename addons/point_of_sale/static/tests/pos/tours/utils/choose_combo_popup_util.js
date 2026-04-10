export function isShown() {
    return [
        {
            content: "choose combo popup is shown",
            trigger: ".choose-combo-popup",
        },
    ];
}

export function apply(option) {
    return [
        {
            content: `Apply combo option ${option}`,
            trigger: `.choose-combo-popup .combo-list .combo-item:contains("${option}") .apply-combo-btn`,
            run: "click",
        },
    ];
}

export function isOptionShown(option) {
    return [
        {
            content: `option ${option} is shown`,
            trigger: `.choose-combo-popup .combo-list .combo-item:contains("${option}")`,
        },
    ];
}
