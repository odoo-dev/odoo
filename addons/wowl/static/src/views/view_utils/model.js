/** @odoo-module **/

import { useBus } from "../../core/hooks";

const { core, hooks } = owl;
const { EventBus } = core;
const { useComponent, useSubEnv, onWillStart, onWillUpdateProps } = hooks;

export class Model extends EventBus {
  constructor() {
    super();
    this.setup();
  }

  setup() {}

  async load(config) {}
}

export function useModel(params = {}) {
  const component = useComponent();

  const ModelClass = params.Model || Model;

  const model = new ModelClass();

  useBus(model, "update", params.onUpdate || component.render);

  function getConfig(props) {
    return Object.assign({}, params, props);
  }

  onWillStart(async () => {
    const config = getConfig(component.props);
    await model.load(config);

    if (params.onWillStart) {
      await params.onWillStart();
    }
  });

  onWillUpdateProps(async (nextProps) => {
    const config = getConfig(nextProps);
    await model.load(config);

    if (params.onWillUpdateProps) {
      await params.onWillUpdateProps();
    }
  });

  const envKey = params.envKey || "model";

  useSubEnv({ [envKey]: model });

  return model;
}
