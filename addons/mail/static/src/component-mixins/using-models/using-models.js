/** @odoo-module alias=mail.componentMixins.usingModels **/

import useModels from 'mail.componentHooks.useModels';

function usingModels(Component) {
    const ComponentUsingModels = class extends Component {
        /**
         * @override
         */
        constructor(...args) {
            super(...args);
            // this.props.x => this.x
            for (const propName in this.props) {
                Object.defineProperty(this, propName, {
                    configurable: true,
                    get:() => this.props[propName],
                });
            }
            useModels();
        }
        /**
         * @override
         */
        async willUpdateProps(nextProps) {
            for (const propName in nextProps) {
                Object.defineProperty(this, propName, {
                    configurable: true,
                    get:() => this.props[propName],
                });
            }
            return super.willUpdateProps(nextProps);
        }
    };
    return ComponentUsingModels;
}

export default usingModels;
