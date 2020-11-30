import { Component } from "@odoo/owl";
import { Registry } from "../core/registry";
import { Type } from "../types";
import { userMenu } from "./user_menu/user_menu";

export interface SystrayItem {
  name: string;
  Component: Type<Component>;
  sequence?: number;
}

export const systrayRegistry: Registry<SystrayItem> = new Registry();

systrayRegistry.add("wowl.user_menu", userMenu);
