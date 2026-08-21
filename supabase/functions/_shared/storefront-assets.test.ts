import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickStorefrontAsset } from "./storefront-assets.ts";

Deno.test("探店首图优先于普通门头近景", () => {
  const canonical = {
    id: "canonical",
    category: "店铺",
    tags: ["探店首图", "中古店", "复古招牌"],
    meta: { summary: "中古店全景门头，招牌醒目，店内陈列完整。" },
  };
  const closeup = {
    id: "closeup",
    category: "店铺",
    tags: ["店铺门头", "复古氛围", "中古杂货"],
    meta: { summary: "店铺入口全景，明亮的招牌与温馨的复古陈设。" },
  };

  assertEquals(pickStorefrontAsset([closeup, canonical])?.id, "canonical");
});
