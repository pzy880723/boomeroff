import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  filterAssetsForSurpriseContentScope,
  resolveSurpriseContentScope,
} from "./surprise-content-scope.ts";

Deno.test("玩具品类只保留玩具素材并明确核心商品", () => {
  const scope = resolveSurpriseContentScope("toys");
  const assets = [
    { id: "toy", category: "玩具公仔", tags: ["Hello Kitty", "迪士尼", "佐藤象", "中古谷子"] },
    { id: "music", category: "唱片音响", tags: ["黑胶"] },
    { id: "jewelry", category: "首饰配饰", tags: ["胸针"] },
  ];

  assertEquals(filterAssetsForSurpriseContentScope(scope, assets).map((asset) => asset.id), ["toy"]);
  assertStringIncludes(scope.prompt, "Hello Kitty");
  assertStringIncludes(scope.prompt, "迪士尼");
  assertStringIncludes(scope.prompt, "佐藤象");
  assertStringIncludes(scope.prompt, "翻不完的中古谷子");
});

Deno.test("唱片和首饰品类不会互相混入素材", () => {
  const assets = [
    { id: "record", category: "唱片音响", tags: ["黑胶唱片"] },
    { id: "accessory", category: "首饰配饰", tags: ["项链", "耳夹"] },
    { id: "ceramic", category: "瓷器餐具", tags: ["茶杯"] },
  ];

  const music = filterAssetsForSurpriseContentScope(resolveSurpriseContentScope("music"), assets);
  const accessories = filterAssetsForSurpriseContentScope(resolveSurpriseContentScope("accessories"), assets);
  assertEquals(music.map((asset) => asset.id), ["record"]);
  assertEquals(accessories.map((asset) => asset.id), ["accessory"]);
  assert(music.every((asset) => asset.id !== "accessory"));
});
