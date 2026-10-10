import { _t } from "@web/core/l10n/translation";

const counterPart = (name, left, width) => ({ name, left, top: 0, width, height: 80 });
const COUNTER_LEFT_END = counterPart("bar-corner-left.svg", 0, 80);
const COUNTER_RIGHT_END = (left) => counterPart("bar-corner.svg", left, 80);

export const DECOR_LIBRARY = [
    {
        id: "seating",
        label: _t("Seating"),
        items: [
            { name: "chair.svg", width: 50, height: 50, label: _t("Chair") },
            { name: "chair-tucked.svg", width: 50, height: 30, label: _t("Half chair") },
            { name: "chair-round.svg", width: 50, height: 50, label: _t("Round chair") },
            {
                name: "chair-round-tucked.svg",
                width: 50,
                height: 30,
                label: _t("Half round chair"),
            },
            { name: "stool.svg", width: 50, height: 50, label: _t("Stool") },
            { name: "stool-half.svg", width: 50, height: 30, label: _t("Half stool") },
            { name: "bench.svg", width: 300, height: 50, label: _t("Bench") },
            { name: "bench-half.svg", width: 300, height: 30, label: _t("Half bench") },
            { name: "sofa.svg", width: 200, height: 90, label: _t("Sofa") },
            { name: "sofa-corner.svg", width: 240, height: 160, label: _t("Corner sofa") },
            { name: "armchair.svg", width: 110, height: 90, label: _t("Armchair") },
        ],
    },
    {
        id: "bar",
        label: _t("Bar"),
        items: [
            {
                name: "counter",
                width: 558,
                height: 80,
                label: _t("Counter"),
                parts: [COUNTER_LEFT_END, counterPart("bar.svg", 79, 400), COUNTER_RIGHT_END(478)],
            },
            {
                name: "counter-open-right",
                width: 479,
                height: 80,
                label: _t("Counter without right end"),
                parts: [COUNTER_LEFT_END, counterPart("bar.svg", 79, 400)],
            },
            {
                name: "counter-open-left",
                width: 479,
                height: 80,
                label: _t("Counter without left end"),
                parts: [counterPart("bar.svg", 0, 400), COUNTER_RIGHT_END(399)],
            },
            { name: "cup.svg", width: 30, height: 30, label: _t("Cup") },
        ],
    },
    {
        id: "plants",
        label: _t("Plants"),
        items: [
            { name: "planter-1.svg", width: 80, height: 60, label: _t("Planter") },
            { name: "planter-2.svg", width: 160, height: 60, label: _t("Double planter") },
            { name: "planter-3.svg", width: 240, height: 60, label: _t("Triple planter") },
            { name: "tree.svg", width: 140, height: 140, label: _t("Tree") },
            { name: "plant-small.svg", width: 60, height: 60, label: _t("Potted plant") },
            { name: "plant.svg", width: 60, height: 60, label: _t("Plant") },
        ],
    },
    {
        id: "signs",
        label: _t("Signs"),
        hideLabels: true,
        items: [
            { name: "cashier.svg", width: 60, height: 60, label: _t("Cashier") },
            { name: "wc.svg", width: 60, height: 60, label: _t("Toilets") },
            { name: "kitchen.svg", width: 60, height: 60, label: _t("Kitchen") },
        ],
    },
];
