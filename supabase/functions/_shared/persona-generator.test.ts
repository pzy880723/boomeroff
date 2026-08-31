import { assertNotEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateFastPersona } from "./persona-generator.ts";

Deno.test("同一品类的新任务可以产生不同且相关的人物外观", () => {
  const first = generateFastPersona({
    assetTags: ["黑胶唱片"],
    assetCategories: ["唱片音响"],
    random: () => 0.05,
  });
  const second = generateFastPersona({
    assetTags: ["黑胶唱片"],
    assetCategories: ["唱片音响"],
    random: () => 0.35,
  });

  assertNotEquals(first.visual, second.visual);
  assertStringIncludes(`${first.label}${first.vibe}`, "唱片");
  assertStringIncludes(`${second.label}${second.vibe}`, "唱片");
});
