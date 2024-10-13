/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { useEffect, useRef } from "@odoo/owl";

import { Component } from "@odoo/owl";

export class CytoscapeGraphWidget extends Component {
    static template = "graphview.CytoscapeGraphWidget";
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.graphRef = useRef("graph");
        this.searchRef = useRef("search");
        this.cy = null;

        useEffect(() => {
            this.loadCytoscape().then(() => {
                this.renderGraph();
            });
        });
    }

    loadCytoscape() {
        return new Promise((resolve, reject) => {
            if (window.cytoscape) {
                resolve();
            } else {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.23.0/cytoscape.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }
        });
    }

    renderGraph() {
        const graphDataProxy = this.props.record.data[this.props.name];
        const graphData = JSON.parse(JSON.stringify(graphDataProxy));

        graphData.container = this.graphRef.el;
        graphData.style = [
            ...(graphData.style || []),
            {
                selector: 'edge.highlighted',
                style: {
                    'width': 2,
                    'line-color': 'data(highlightColor)',
                    'target-arrow-color': 'data(highlightColor)',
                    'z-index': 10,
                }
            },
            {
                selector: 'node.highlighted',
                style: {
                    'background-color': 'data(highlightColor)',
                    'text-outline-color': 'data(highlightColor)',
                    'text-outline-width': 2,
                    'color': 'white',
                    'z-index': 10,
                }
            },
        ];

        this.cy = cytoscape(graphData);

        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            this.highlightNodeAndChildren(node);
        });

        this.cy.on('cxttap', 'node', (evt) => {
            const node = evt.target;
            this.highlightNodeAndParents(node);
        });

        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.resetHighlight();
            }
        });

        // Fit the graph to the container
        this.cy.fit();
    }

    highlightNodeAndParents(node) {
        this.resetHighlight();
        const elementsToHighlight = new Set();
        const highlightParents = (n) => {
            elementsToHighlight.add(n);
            const incomers = n.incomers();
            incomers.forEach(incomer => {
                if (incomer.isNode()) {
                    highlightParents(incomer);
                } else if (incomer.isEdge()) {
                    elementsToHighlight.add(incomer);
                }
            });
        };
        highlightParents(node);
        this.cy.elements().forEach(ele => {
            if (elementsToHighlight.has(ele)) {
                ele.addClass('highlighted');
                ele.data('highlightColor', 'blue');
            }
        });
    }

    highlightNodeAndChildren(node) {
        this.resetHighlight();
        const elementsToHighlight = new Set();
        const highlightChildren = (n) => {
            elementsToHighlight.add(n);
            const outgoers = n.outgoers();
            outgoers.forEach(outgoer => {
                if (outgoer.isNode()) {
                    highlightChildren(outgoer);
                } else if (outgoer.isEdge()) {
                    elementsToHighlight.add(outgoer);
                }
            });
        };
        highlightChildren(node);
        this.cy.elements().forEach(ele => {
            if (elementsToHighlight.has(ele)) {
                ele.addClass('highlighted');
                ele.data('highlightColor', '#714B67');
            }
        });
    }

    resetHighlight() {
        this.cy.elements().removeClass('highlighted');
        this.cy.elements().removeData('highlightColor');
    }

    onSearchSubmit(ev) {
        ev.preventDefault();
        this.resetHighlight();
        const searchTerm = this.searchRef.el.value.toLowerCase();
        const matchedNodes = this.cy.nodes().filter(node =>
            node.data('label').toLowerCase() === searchTerm
        );
        matchedNodes.addClass('highlighted');
        matchedNodes.data('highlightColor', 'orange');
        if (matchedNodes.length > 0) {
            this.cy.fit(matchedNodes, 300);
        }
    }
}

export const cytoscapeGraphField = {
    component: CytoscapeGraphWidget,
    displayName: _t("Cytoscape Graph"),
    supportedTypes: ["json"],
    extractProps: ({ attrs }) => {
        return {};
    },
};

registry.category("fields").add("cytoscape_graph", cytoscapeGraphField);
