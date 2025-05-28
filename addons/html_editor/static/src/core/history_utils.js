/**
 * Bidirectional map that maintains mappings in both directions
 *
 * @template K The type of keys in the map
 * @template V The type of values in the map
 */
export class BiMap {
    constructor() {
        // Private properties enclosed in the constructor
        /** @type {Map<K, V>} */
        const keyToValue = new Map();
        /** @type {Map<V, K>} */
        const valueToKey = new Map();

        // Public methods
        /** @type {(key: K, value: V) => this} */
        this.set = (key, value) => {
            // Remove old mappings
            this.deleteByKey(key);
            this.deleteByValue(value);
            // Set new mappings
            keyToValue.set(key, value);
            valueToKey.set(value, key);
            return this;
        };

        /** @type {(key: K) => V | undefined} */
        this.getByKey = (key) => keyToValue.get(key);

        /** @type {(value: V) => K | undefined} */
        this.getByValue = (value) => valueToKey.get(value);

        /** @type {(key: K) => boolean} */
        this.hasKey = (key) => keyToValue.has(key);

        /** @type {(value: V) => boolean} */
        this.hasValue = (value) => valueToKey.has(value);

        /** @type {(key: K) => boolean} */
        this.deleteByKey = (key) => {
            if (keyToValue.has(key)) {
                const value = keyToValue.get(key);
                valueToKey.delete(value);
            }
            return keyToValue.delete(key);
        };

        /** @type {(value: V) => boolean} */
        this.deleteByValue = (value) => {
            if (valueToKey.has(value)) {
                const key = valueToKey.get(value);
                keyToValue.delete(key);
            }
            return valueToKey.delete(value);
        };

        /** @type {() => number} */
        this.size = () => keyToValue.size;

        this.clear = () => {
            keyToValue.clear();
            valueToKey.clear();
        };
    }
}

/**
 * @extends {BiMap<string, Node>}
 */
export class NodeBiMap extends BiMap {
    constructor() {
        super();
        /** @type {(id: string) => Node | undefined} */
        this.getNode = this.getByKey;
        /** @type {(node: Node) => string | undefined} */
        this.getId = this.getByValue;
        /** @type {(node: Node) => boolean} */
        this.hasNode = this.hasValue;
    }

    /**
     * @param {string} id
     * @param {Node} node
     * @returns {this}
     */
    set(id, node) {
        if (!node) {
            throw new Error("Node cannot be null or undefined");
        }
        return super.set(id, node);
    }
}
