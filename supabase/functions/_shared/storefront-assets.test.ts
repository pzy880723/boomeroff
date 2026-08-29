import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isCanonicalStorefrontAsset,
  pickStorefrontAsset,
  resolveStorefrontAsset,
} from "./storefront-assets.ts";

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

Deno.test("门店资料指定的真实门头在 AI 标签缺失时仍可用于脚本", () => {
  const storefrontUrl = "https://cdn.example.com/wenzhou-storefront.jpg";
  const uploadedStorefront = {
    id: "uploaded-storefront",
    output_url: storefrontUrl,
    category: null,
    tags: [],
    meta: { asset_class: "base" },
  };
  const interior = {
    id: "interior",
    output_url: "https://cdn.example.com/interior.jpg",
    category: "店铺",
    tags: ["店内陈列"],
    meta: { summary: "中古杂货货架与商品陈列。" },
  };

  assertEquals(
    resolveStorefrontAsset([interior, uploadedStorefront], storefrontUrl)?.id,
    "uploaded-storefront",
  );
});

Deno.test("只有完整真实门头标签才自动晋升为门店标准封面", () => {
  assertEquals(isCanonicalStorefrontAsset({
    tags: ["探店首图", "门头全景", "店招"],
    meta: { summary: "店铺入口全景，BOOMER·OFF 店招清晰可见。" },
  }), true);
  assertEquals(isCanonicalStorefrontAsset({
    tags: ["店铺", "商品陈列"],
    meta: { summary: "店内货架与收银台。" },
  }), false);
});
