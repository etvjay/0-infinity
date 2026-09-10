import { readFile } from "node:fs/promises";
import { verifySerializedMandate } from "0-infinity/mandate";

const file = process.argv[2];
if (!file) throw new Error("usage: node verify.mjs <mandate.json>");
const serialized = await readFile(file, "utf8");
const result = verifySerializedMandate(serialized);
console.log(JSON.stringify(result));
if (!result.valid) process.exitCode = 1;
