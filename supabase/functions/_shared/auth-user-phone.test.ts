import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  findAuthUserByPhone,
  normalizeChinaPhone,
  type AuthUserLike,
} from "./auth-user-phone.ts";

Deno.test("normalizeChinaPhone accepts mainland and +86 forms", () => {
  assertEquals(normalizeChinaPhone("186 5743 3310"), "18657433310");
  assertEquals(normalizeChinaPhone("+86-186-5743-3310"), "18657433310");
  assertEquals(normalizeChinaPhone("not-a-phone"), "");
});

Deno.test("findAuthUserByPhone matches auth phone, metadata phone and phone email", async () => {
  const users: AuthUserLike[] = [
    { id: "auth-phone", phone: "+86 18657433310" },
    { id: "metadata-phone", user_metadata: { phone: "13800138000" } },
    { id: "email-phone", email: "13900139000@boomeroff.local" },
  ];

  const listPage = () => Promise.resolve(users);
  assertEquals((await findAuthUserByPhone(listPage, "18657433310"))?.id, "auth-phone");
  assertEquals((await findAuthUserByPhone(listPage, "13800138000"))?.id, "metadata-phone");
  assertEquals((await findAuthUserByPhone(listPage, "13900139000"))?.id, "email-phone");
});

Deno.test("findAuthUserByPhone continues to the next auth page", async () => {
  const calls: number[] = [];
  const firstPage = Array.from({ length: 200 }, (_, index) => ({
    id: `page-one-${index}`,
    email: `user-${index}@boomeroff.local`,
  }));

  const result = await findAuthUserByPhone(async (page) => {
    calls.push(page);
    return page === 1
      ? firstPage
      : [{ id: "target", user_metadata: { phone: "18657433310" } }];
  }, "18657433310");

  assertEquals(result?.id, "target");
  assertEquals(calls, [1, 2]);
});

Deno.test("findAuthUserByPhone stops after a short page", async () => {
  const calls: number[] = [];
  const result = await findAuthUserByPhone(async (page) => {
    calls.push(page);
    return [{ id: "someone-else", phone: "13800138000" }];
  }, "18657433310");

  assertEquals(result, null);
  assertEquals(calls, [1]);
});
