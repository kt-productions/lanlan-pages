import test from "node:test";
import assert from "node:assert/strict";
import { createLoginDestination } from "../src/features/orders/login-destination.js";

test("作品登入目的頁可跨 OAuth 回程取回一次，其他目標不轉址", () => {
  const data = new Map();
  const storage = () => ({
    setItem: (key, value) => data.set(key, value),
    getItem: (key) => data.get(key),
    removeItem: (key) => data.delete(key),
  });
  createLoginDestination("?return=artworks", storage).remember();
  assert.equal(createLoginDestination("", storage).take(), "../artworks/");
  assert.equal(createLoginDestination("", storage).take(), null);
  for (const value of [
    "https://other.example",
    "//other.example",
    "../../",
    "artworks/",
    "admin",
  ]) {
    const destination = createLoginDestination(`?return=${encodeURIComponent(value)}`, storage);
    destination.remember();
    assert.equal(destination.take(), null);
  }
  const destination = createLoginDestination("?return=artworks", storage);
  destination.remember();
  destination.clear();
  assert.equal(createLoginDestination("", storage).take(), null);
});

test("禁止保存時仍支援原分頁目的地，一般登入不延用舊目的地", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  const destination = createLoginDestination("?return=artworks", blocked);
  destination.remember();
  assert.equal(destination.take(), "../artworks/");
  const data = new Map([["lanlan-admin-login-destination", "artworks"]]);
  const ordinary = createLoginDestination("", () => ({
    getItem: (key) => data.get(key),
    removeItem: (key) => data.delete(key),
  }));
  ordinary.remember();
  assert.equal(ordinary.take(), null);
});

test("收益檢視跨 OAuth 回程後還原，本頁登入及重新整理不重複轉址", () => {
  const data = new Map();
  const storage = () => ({
    setItem: (key, value) => data.set(key, value),
    getItem: (key) => data.get(key),
    removeItem: (key) => data.delete(key),
  });
  const revenue = createLoginDestination("?view=revenue", storage);
  assert.equal(revenue.take(), null);
  revenue.remember();
  assert.equal(createLoginDestination("", storage).take(), "../admin/?view=revenue");
  assert.equal(createLoginDestination("", storage).take(), null);
  revenue.remember();
  assert.equal(revenue.take(), null);
  assert.equal(data.size, 0);
  revenue.remember();
  const ordinary = createLoginDestination("", storage);
  ordinary.remember();
  assert.equal(ordinary.take(), null);
  assert.equal(createLoginDestination("?return=revenue", storage).take(), "../admin/?view=revenue");
  for (const value of [
    "https://other.example",
    "//other.example",
    "../../",
    "constructor",
    "__proto__",
  ]) {
    data.set("lanlan-admin-login-destination", value);
    assert.equal(createLoginDestination("", storage).take(), null);
    assert.equal(
      createLoginDestination(`?view=${encodeURIComponent(value)}`, storage).take(),
      null,
    );
  }
});
