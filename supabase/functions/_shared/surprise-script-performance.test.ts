import { assertEquals, assertNotEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFastSurpriseFallback,
  completeShortGeneratedScript,
} from "./surprise-script-performance.ts";
import { validateSurpriseScript } from "./surprise-script-policy.ts";

Deno.test("短对白不会再被逐字拼接固定尾句", () => {
  const input = {
    title: "测试",
    hook: { dialogue: "门口先看招牌", subtitle: "门口先看招牌", duration_s: 3 },
    scenes: [
      { dialogue: "进门开始翻唱片", subtitle: "进门开始翻唱片", duration_s: 3 },
      { dialogue: "封面越翻越有趣", subtitle: "封面越翻越有趣", duration_s: 3 },
      { dialogue: "挑到喜欢的真开心", subtitle: "挑到喜欢的真开心", duration_s: 3 },
    ],
    outro: { dialogue: "来店里慢慢找", subtitle: "来店里慢慢找", duration_s: 3 },
  };

  const output = completeShortGeneratedScript(input);
  assertEquals(output.hook.dialogue, "门口先看招牌");
  assertEquals(output.scenes[1].dialogue, "封面越翻越有趣");
  assertNotEquals(output.scenes[1].dialogue, "封面越翻越有趣拿在手里越看细节越有意思");
});

Deno.test("三个品类的兜底脚本保持各自种草主线", () => {
  const toys = buildFastSurpriseFallback({ variationKey: "toy-a", contentScopeKey: "toys" });
  const music = buildFastSurpriseFallback({ variationKey: "music-a", contentScopeKey: "music" });
  const accessories = buildFastSurpriseFallback({ variationKey: "jewelry-a", contentScopeKey: "accessories" });

  assertStringIncludes(toys.continuous_dialogue || "", "中古谷子");
  assertStringIncludes(toys.continuous_dialogue || "", "佐藤象");
  assertStringIncludes(music.continuous_dialogue || "", "黑胶");
  assertStringIncludes(accessories.continuous_dialogue || "", "首饰");
  assertEquals(validateSurpriseScript(toys).errors, []);
  assertEquals(validateSurpriseScript(music).errors, []);
  assertEquals(validateSurpriseScript(accessories).errors, []);
});
