import assert from "node:assert/strict";
import test from "node:test";
import { parseEnv } from "../src/env.js";

test("parseEnv reads the lowercase OpenRouter key format without evaluating shell code", () => {
  assert.deepEqual(parseEnv("# local\nopenrouter='secret-value'\nINVALID LINE\n"), {
    openrouter: "secret-value",
  });
});
