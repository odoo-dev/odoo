/** @odoo-module **/

import { parseArgs } from "./py_utils";

const fmt2 = (n) => String(n).padStart(2, "0");
const fmt4 = (n) => String(n).padStart(4, "0");

export class PyDate extends Date {
  /**
   * @returns {PyDate}
   */
  static today() {
    return new PyDate();
  }

  /**
   * @param  {...any} args
   * @returns {PyDate}
   */
  static create(...args) {
    const date = new PyDate();
    const namedArgs = parseArgs(args, ["year", "month", "day"]);
    date.setUTCFullYear(namedArgs.year);
    date.setUTCMonth(namedArgs.month - 1);
    date.setUTCDate(namedArgs.day);
    return date;
  }

  /**
   * @param {string} format
   * @returns {string}
   */
  strftime(format) {
    const date = this;
    return format.replace(/%([A-Za-z])/g, function (m, c) {
      switch (c) {
        case "Y":
          return fmt4(date.getUTCFullYear());
        case "m":
          return fmt2(date.getUTCMonth() + 1);
        case "d":
          return fmt2(date.getUTCDate());
      }
      throw new Error("ValueError: No known conversion for " + m);
    });
  }

  /**
   * @returns {number}
   */
  get year() {
    return this.getUTCFullYear();
  }
  /**
   * @returns {number}
   */
  get month() {
    return this.getUTCMonth() + 1;
  }
  /**
   * @returns {number}
   */
  get day() {
    return this.getUTCDate();
  }
}

export class PyDateTime extends PyDate {
  /**
   * @returns {PyDateTime}
   */
  static now() {
    return new PyDateTime();
  }

  /**
   * @param  {...any} args
   * @returns {PyDateTime}
   */
  static create(...args) {
    const date = new PyDateTime();
    const namedArgs = parseArgs(args, [
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "microsecond",
    ]);
    date.setUTCMilliseconds(namedArgs.micro / 1000 || 0);
    date.setUTCSeconds(namedArgs.second || 0);
    date.setUTCMinutes(namedArgs.minute || 0);
    date.setUTCHours(namedArgs.hour || 0);
    date.setUTCDate(namedArgs.day);
    date.setUTCMonth(namedArgs.month - 1);
    date.setUTCFullYear(namedArgs.year);
    return date;
  }

  /**
   * @param  {...any} args
   * @returns {PyDateTime}
   */
  static combine(...args) {
    const { date, time } = parseArgs(args, ["date", "time"]);
    return PyDateTime.create(date.year, date.month, date.day, time.hour, time.minute, time.second);
  }

  /**
   * @param {string} format
   * @returns {string}
   */
  strftime(format) {
    const date = this;
    return format.replace(/%([A-Za-z])/g, function (m, c) {
      switch (c) {
        case "Y":
          return fmt4(date.getUTCFullYear());
        case "m":
          return fmt2(date.getUTCMonth() + 1);
        case "d":
          return fmt2(date.getUTCDate());
        case "H":
          return fmt2(date.getUTCHours());
        case "M":
          return fmt2(date.getUTCMinutes());
        case "S":
          return fmt2(date.getUTCSeconds());
      }
      throw new Error("ValueError: No known conversion for " + m);
    });
  }

  /**
   * @returns {number}
   */
  get hour() {
    return this.getUTCHours();
  }

  /**
   * @returns {number}
   */
  get minute() {
    return this.getUTCMinutes();
  }

  /**
   * @returns {number}
   */
  get second() {
    return this.getUTCSeconds();
  }
}

export class PyTime extends PyDate {
  /**
   * @param  {...any} args
   * @returns {PyTime}
   */
  static create(...args) {
    const date = new PyTime();
    const namedArgs = parseArgs(args, ["hour", "minute", "second"]);
    date.setUTCSeconds(namedArgs.second || 0);
    date.setUTCMinutes(namedArgs.minute || 0);
    date.setUTCHours(namedArgs.hour || 0);
    return date;
  }

  /**
   * @param {string} format
   * @returns {string}
   */
  strftime(format) {
    const date = this;
    return format.replace(/%([A-Za-z])/g, function (m, c) {
      switch (c) {
        case "H":
          return fmt2(date.getUTCHours());
        case "M":
          return fmt2(date.getUTCMinutes());
        case "S":
          return fmt2(date.getUTCSeconds());
      }
      throw new Error("ValueError: No known conversion for " + m);
    });
  }

  /**
   * @returns {number}
   */
  get hour() {
    return this.getUTCHours();
  }

  /**
   * @returns {number}
   */
  get minute() {
    return this.getUTCMinutes();
  }

  /**
   * @returns {number}
   */
  get second() {
    return this.getUTCSeconds();
  }
}

const argsSpec = "year month day hour minute second years months weeks days hours minutes seconds weekday".split(
  " "
);

export class PyRelativeDelta {
  /**
   * @param  {...any} args
   * @returns {PyRelativeDelta}
   */
  static create(...args) {
    const delta = new PyRelativeDelta();
    const namedArgs = parseArgs(args, argsSpec);
    delta.year = (namedArgs.year || 0) + (namedArgs.years || 0);
    delta.month = (namedArgs.month || 0) + (namedArgs.months || 0);
    delta.day = (namedArgs.day || 0) + (namedArgs.days || 0);
    delta.hour = (namedArgs.hour || 0) + (namedArgs.hours || 0);
    delta.minute = (namedArgs.minute || 0) + (namedArgs.minutes || 0);
    delta.second = (namedArgs.second || 0) + (namedArgs.seconds || 0);
    delta.day += 7 * (namedArgs.weeks || 0);
    if (namedArgs.weekday) {
      throw new Error("hmm, not implemented");
    }
    return delta;
  }

  /**
   * @param {PyDate} date
   * @param {PyRelativeDelta} delta
   * @returns {PyDate}
   */
  static add(date, delta) {
    const clone = new PyDate(date.getTime());
    clone.setUTCFullYear(clone.getUTCFullYear() + delta.year);
    clone.setUTCMonth(clone.getUTCMonth() + delta.month);
    clone.setDate(clone.getDate() + delta.day);
    clone.setUTCHours(clone.getUTCHours() + delta.hour);
    clone.setUTCMinutes(clone.getUTCMinutes() + delta.minute);
    clone.setUTCSeconds(clone.getUTCSeconds() + delta.second);
    return clone;
  }

  constructor() {
    this.year = 0;
    this.month = 0;
    this.day = 0;
    this.hour = 0;
    this.minute = 0;
    this.second = 0;
  }
}
