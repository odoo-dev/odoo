import { Component, hooks, useState } from "@odoo/owl";
import { useAutofocus } from "../core/hooks";
import { OdooEnv } from "../types";

interface PagerModel {
  limit: number;
  currentMinimum: number;
  size: number;
  disabled: boolean;
}
interface UsePagerParams {
  limit: number;
  currentMinimum?: number;
  size?: number;
  disabled?: boolean;
  onPagerChanged: (
    currentMinimum: number,
    limit: number
  ) => Promise<Partial<PagerModel>> | Partial<PagerModel>;
}
interface PagerProps {
  model: PagerModel;
  withAccessKey?: boolean;
}

/**
 * usePager hook
 */
export function usePager(ref: string, params: UsePagerParams) {
  const comp: Component = Component.current!;
  const pagerRef = hooks.useRef(ref);
  const pagerModel: PagerModel = {
    currentMinimum: "currentMinimum" in params ? params.currentMinimum || 0 : 1,
    disabled: params.disabled || false,
    limit: params.limit,
    size: params.size || 0,
  };

  async function onPagerChanged(ev: any) {
    if (ev.originalComponent === pagerRef.comp) {
      ev.stopPropagation();
      pagerModel.disabled = true;
      pagerRef.comp!.render();
      const limit = ev.detail.limit;
      const currentMinimum = ev.detail.currentMinimum;
      let newModel = await params.onPagerChanged(currentMinimum, limit);
      pagerModel.limit = "limit" in newModel ? newModel.limit : limit;
      pagerModel.currentMinimum =
        "currentMinimum" in newModel ? newModel.currentMinimum : currentMinimum;
      pagerModel.size = "size" in newModel ? newModel.size || 0 : pagerModel.size;
      pagerModel.disabled = false;
      pagerRef.comp!.render();
    }
  }
  hooks.onMounted(() => {
    comp.el!.addEventListener("pager-changed", onPagerChanged);
  });
  hooks.onWillUnmount(() => {
    comp.el!.removeEventListener("pager-changed", onPagerChanged);
  });

  return pagerModel;
}

/**
 * Pager
 *
 * The pager goes from 1 to size (included).
 * The current value is currentMinimum if limit === 1 or the interval:
 *      [currentMinimum, currentMinimum + limit[ if limit > 1].
 * The value can be manually changed by clicking on the pager value and giving
 * an input matching the pattern: min[,max] (in which the comma can be a dash
 * or a semicolon).
 * The pager also provides two buttons to quickly change the current page (next
 * or previous).
 * @extends Component
 */
export class Pager extends Component<PagerProps, OdooEnv> {
  static template = "wowl.Pager";
  static props = {
    model: {
      currentMinimum: Number,
      limit: Number,
      size: Number,
      disabled: Boolean,
    },
    withAccessKey: { type: Boolean, optional: true },
  };
  static defaultProps = {
    disabled: false,
    withAccessKey: true,
  };

  state = useState({
    editing: false,
  });

  constructor() {
    super(...arguments);
    useAutofocus();
  }

  get maximum(): number {
    return Math.min(
      this.props.model.currentMinimum + this.props.model.limit - 1,
      this.props.model.size
    );
  }
  get singlePage(): boolean {
    const { currentMinimum, size } = this.props.model;
    return 1 === currentMinimum && this.maximum === size;
  }
  get value(): string {
    return this.props.model.currentMinimum + (this.props.model.limit > 1 ? `-${this.maximum}` : "");
  }

  /**
   * Update the pager's state according to a pager action
   * @param {number} [direction] the action (previous or next) on the pager
   */
  changeSelection(direction: number) {
    const { limit, size } = this.props.model;

    let currentMinimum = this.props.model.currentMinimum + limit * direction;
    if (currentMinimum > size) {
      currentMinimum = 1;
    } else if (currentMinimum < 1 && limit === 1) {
      currentMinimum = size;
    } else if (currentMinimum < 1 && limit > 1) {
      currentMinimum = size - (size % limit || limit) + 1;
    }

    this.update(currentMinimum, limit);
  }
  /**
   * Save the state from the content of the input
   * @param {string} value the new raw pager value
   */
  saveValue(value: string) {
    const [min, max] = value.trim().split(/\s*[\-\s,;]\s*/);

    let currentMinimum = Math.max(Math.min(parseInt(min, 10), this.props.model.size), 1);
    let maximum = max
      ? Math.max(Math.min(parseInt(max, 10), this.props.model.size), 1)
      : parseInt(min, 10);

    if (!isNaN(currentMinimum) && !isNaN(maximum) && currentMinimum <= maximum) {
      const limit = Math.max(maximum - currentMinimum) + 1;
      this.update(currentMinimum, limit);
    }
  }
  /**
   * The pager has been updated, notify the world of the new values.
   */
  update(currentMinimum: number, limit: number) {
    this.state.editing = false;
    this.trigger("pager-changed", { currentMinimum, limit });
  }

  //----------------------------------------------------------------------------
  // Handlers
  //----------------------------------------------------------------------------

  onBlur() {
    this.state.editing = false;
  }
  onEdit() {
    if (!this.props.model.disabled) {
      this.state.editing = true;
    }
  }
  onValueChange(ev: InputEvent) {
    this.saveValue((ev.currentTarget as HTMLInputElement).value);
  }
  onValueKeydown(ev: any) {
    switch (ev.key) {
      case "Enter":
        ev.preventDefault();
        ev.stopPropagation();
        this.saveValue(ev.currentTarget.value);
        break;
      case "Escape":
        ev.preventDefault();
        ev.stopPropagation();
        this.state.editing = false;
        break;
    }
  }
}
