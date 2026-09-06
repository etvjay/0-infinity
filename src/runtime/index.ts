/**
 * 0-Infinity mandate runtime — public surface for the deterministic mandate
 * lifecycle state machine (M-B1, change ZO-BIN-MB1-C).
 *
 * Pure module: no network, no Binance, no model I/O, no wall-clock reads.
 */
export * from "./mandateState.js";
export * from "./mandateEvents.js";
export * from "./mandateRuntime.js";
