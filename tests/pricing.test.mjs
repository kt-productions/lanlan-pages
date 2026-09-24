import test from "node:test";
import assert from "node:assert/strict";
import { readCommission } from "../scripts/lib/content.mjs";
import { estimateCommission } from "../src/features/commission/pricing.js";

const config = await readCommission();
const quote = (service, values = {}) =>
  estimateCommission(config, {
    service,
    characterCount: "1",
    transition: "no",
    commercial: "no",
    background: "yes",
    rush: "no",
    payment: "bank",
    ...values,
  });
const amounts = (estimate) => [estimate.min, estimate.max];

test("動畫加價、折抵與付款切換使用同一組合計", () => {
  assert.equal(quote("animation").currency, "TWD");
  assert.deepEqual(amounts(quote("animation")), [4500, 6500]);
  assert.deepEqual(amounts(quote("animation", { background: "no" })), [3000, 5000]);
  const selected = { commercial: "yes", background: "no", rush: "yes" };
  assert.deepEqual(amounts(quote("animation", selected)), [6500, 8500]);
  assert.deepEqual(amounts(quote("animation", { ...selected, payment: "paypal" })), [6825, 8925]);
  assert.deepEqual(amounts(quote("animation", { ...selected, payment: "bank" })), [6500, 8500]);
});

test("小動圖方案、每角色複雜費及固定急件費連動", () => {
  assert.deepEqual(amounts(quote("chibi")), [600, 1400]);
  assert.deepEqual(
    amounts(quote("chibi", { chibiPlan: "illustration", payment: "paypal" })),
    [630, 840],
  );
  assert.deepEqual(
    amounts(quote("chibi", { chibiPlan: "animated", payment: "paypal" })),
    [1260, 1470],
  );
  const rush = quote("chibi", {
    chibiPlan: "animated",
    rush: "yes",
    payment: "paypal",
  });
  assert.deepEqual(amounts(rush), [1890, 2100]);
  assert.deepEqual(
    rush.items.find((item) => item.label === "加急插隊"),
    { label: "加急插隊", min: 600, max: 600 },
  );
  assert.ok(!rush.notes.some((note) => note.includes("300／600")));
});

test("雙人動畫與轉場累加，每位角色分別計算複雜費", () => {
  const double = { characterCount: "2", transition: "yes" };
  const result = quote("animation", double);
  assert.deepEqual(amounts(result), [8000, 12500]);
  assert.deepEqual(
    result.items.filter((item) => /角色 \d 複雜費/.test(item.label)),
    [
      { label: "角色 1 複雜費", min: 0, max: 2000 },
      { label: "角色 2 複雜費", min: 0, max: 2000 },
    ],
  );
  assert.deepEqual(amounts(quote("animation", { ...double, transition: "no" })), [7500, 11500]);
  assert.deepEqual(
    amounts(quote("animation", { ...double, characterCount: "1", transition: "no" })),
    [4500, 6500],
  );
  assert.deepEqual(
    amounts(
      quote("animation", {
        ...double,
        commercial: "yes",
        background: "no",
        rush: "yes",
        payment: "paypal",
      }),
    ),
    [10500, 15225],
  );
});

test("小動圖雙人只對方案原價加 50%，不放大急件與複雜費", () => {
  const double = { characterCount: "2" };
  assert.deepEqual(amounts(quote("chibi", double)), [900, 2200]);
  assert.deepEqual(amounts(quote("chibi", { ...double, chibiPlan: "illustration" })), [900, 1300]);
  const animated = quote("chibi", {
    ...double,
    chibiPlan: "animated",
    rush: "yes",
  });
  assert.deepEqual(amounts(animated), [2400, 2800]);
  assert.equal(animated.items.filter((item) => /角色 \d 複雜費/.test(item.label)).length, 2);
  assert.deepEqual(
    animated.items.find((item) => item.label.includes("方案原價")),
    { label: "第二角色（方案原價 +50%）", min: 600, max: 600 },
  );
  assert.deepEqual(
    amounts(
      quote("chibi", {
        ...double,
        chibiPlan: "animated",
        rush: "yes",
        payment: "paypal",
      }),
    ),
    [2520, 2940],
  );
});

test("貼圖原價、商用倍數、PayPal 小數與取消選擇", () => {
  assert.deepEqual(
    amounts(
      quote("stickers", {
        stickerIds: [1, 48],
        commercial: "yes",
        payment: "paypal",
      }),
    ),
    [735, 735],
  );
  assert.deepEqual(
    amounts(quote("stickers", { stickerIds: [28], payment: "paypal" })),
    [52.5, 52.5],
  );
  const empty = quote("stickers", {
    stickerIds: [],
    commercial: "yes",
    payment: "paypal",
  });
  assert.equal(empty.empty, true);
  assert.deepEqual(amounts(empty), [0, 0]);
});

test("三類 PayPal 統一按加減價後小計的 5% 計算，轉帳不收取", () => {
  const allStickers = config.stickerOptions.map((item) => item.number);
  for (const [service, selection, fee, total] of [
    ["animation", {}, [225, 325], [4725, 6825]],
    ["chibi", { chibiPlan: "animated" }, [60, 70], [1260, 1470]],
    ["stickers", { stickerIds: allStickers }, [330, 330], [6930, 6930]],
  ]) {
    const result = quote(service, { ...selection, payment: "paypal" });
    const line = result.items.find((item) => item.label.startsWith("PayPal"));
    assert.equal(line.label, "PayPal 手續費（5%）");
    assert.deepEqual([line.min, line.max], fee);
    assert.deepEqual(amounts(result), total);
    assert.ok(!result.notes.some((note) => note.includes("PayPal 費率待確認")));
    assert.ok(
      !quote(service, { ...selection, payment: "bank" }).items.some((item) =>
        item.label.startsWith("PayPal"),
      ),
    );
  }
});

test("數量折扣只套用達標的最高級距", () => {
  // 分離數量折扣，讓全部 48 款只驗證最高級距，不受半價規則影響。
  const quantityOnly = structuredClone(config);
  quantityOnly.services.stickers.pricing.halfPriceIds = [];
  for (const [count, discount] of [
    [11, 0],
    [12, 100],
    [13, 100],
    [23, 100],
    [24, 250],
    [25, 250],
    [35, 250],
    [36, 400],
    [37, 400],
    [47, 400],
    [48, 600],
  ]) {
    const selected = config.stickerOptions.slice(0, count);
    const subtotal = selected.reduce((sum, item) => sum + item.price, 0);
    const result = estimateCommission(quantityOnly, {
      service: "stickers",
      commercial: "no",
      payment: "bank",
      stickerIds: selected.map((item) => item.number),
    });
    assert.deepEqual(amounts(result), [subtotal - discount, subtotal - discount], `${count} 款`);
  }
});

test("33–35 第二／第三款半價，商用按折扣後金額乘 2", () => {
  assert.deepEqual(amounts(quote("stickers", { stickerIds: [33] })), [200, 200]);
  assert.deepEqual(amounts(quote("stickers", { stickerIds: [33, 34] })), [300, 300]);
  assert.deepEqual(amounts(quote("stickers", { stickerIds: [33, 34, 35] })), [400, 400]);
  assert.deepEqual(
    amounts(quote("stickers", { stickerIds: [33, 34, 35], commercial: "yes" })),
    [800, 800],
  );
});

test("48 款的數量與款式折扣固定併用，分別列出 600 與 200", () => {
  const ids = config.stickerOptions.map((item) => item.number);
  const ordinary = quote("stickers", { stickerIds: ids });
  assert.deepEqual(amounts(ordinary), [6600, 6600]);
  assert.deepEqual(
    ordinary.items.filter((item) => item.min < 0),
    [
      { label: "滿 48 張數量折扣", min: -600, max: -600 },
      { label: "No.33–35 第 2、3 款半價", min: -200, max: -200 },
    ],
  );
  assert.ok(!ordinary.notes.some((note) => note.includes("計算順序待確認")));
  const commercial = quote("stickers", { stickerIds: ids, commercial: "yes" });
  assert.deepEqual(amounts(commercial), [13200, 13200]);
  assert.deepEqual(
    commercial.items.find((item) => item.label.startsWith("商用")),
    { label: "商用加價（折扣後總價 ×2）", min: 6600, max: 6600 },
  );
  assert.deepEqual(
    amounts(
      quote("stickers", {
        stickerIds: ids,
        commercial: "yes",
        payment: "paypal",
      }),
    ),
    [13860, 13860],
  );
  assert.ok(!commercial.notes.some((note) => note.includes("計算順序待確認")));
});

test("各數量門檻皆與款式折扣併用，取消款式會重算兩種折扣", () => {
  const regular = config.stickerOptions.filter((item) => ![33, 34, 35].includes(item.number));
  for (const [count, quantityDiscount] of [
    [12, 100],
    [24, 250],
    [36, 400],
    [48, 600],
  ]) {
    const selected = [
      ...regular.slice(0, count - 3),
      ...config.stickerOptions.filter((item) => [33, 34, 35].includes(item.number)),
    ];
    const subtotal = selected.reduce((sum, item) => sum + item.price, 0);
    const result = quote("stickers", {
      stickerIds: selected.map((item) => item.number),
    });
    assert.deepEqual(amounts(result), [
      subtotal - quantityDiscount - 200,
      subtotal - quantityDiscount - 200,
    ]);
  }
  const allExcept35 = config.stickerOptions
    .filter((item) => item.number !== 35)
    .map((item) => item.number);
  assert.deepEqual(amounts(quote("stickers", { stickerIds: allExcept35 })), [6700, 6700]);
  assert.deepEqual(
    amounts(quote("stickers", { stickerIds: allExcept35, payment: "paypal" })),
    [7035, 7035],
  );
});

test("跨類型不計入不適用選項；排除重複及未開放的貼圖", () => {
  assert.deepEqual(
    amounts(
      quote("chibi", {
        chibiPlan: "illustration",
        commercial: "yes",
        background: "no",
        transition: "yes",
        stickerIds: [1],
      }),
    ),
    [600, 800],
  );
  assert.deepEqual(
    amounts(quote("animation", { chibiPlan: "animated", stickerIds: [1, 2] })),
    [4500, 6500],
  );
  assert.deepEqual(
    amounts(
      quote("stickers", {
        stickerIds: [1, 1, 49, 50],
        characterCount: "2",
        transition: "yes",
        rush: "yes",
        background: "no",
      }),
    ),
    [200, 200],
  );
});

test("各項明細可加總回預估上下限，且不代表正式報價", () => {
  for (const result of [
    quote("animation", {
      characterCount: "2",
      transition: "yes",
      commercial: "yes",
      background: "no",
      rush: "yes",
      payment: "paypal",
    }),
    quote("chibi", { characterCount: "2", rush: "yes", payment: "paypal" }),
    quote("stickers", {
      stickerIds: [33, 34, 35],
      commercial: "yes",
      payment: "paypal",
    }),
  ]) {
    for (const key of ["min", "max"])
      assert.equal(
        Math.round(result.items.reduce((sum, item) => sum + item[key], 0) * 100),
        Math.round(result[key] * 100),
      );
    assert.equal(result.confirmed, false);
    assert.ok(result.min <= result.max);
  }
});

test("未知類型明確拒絕，未知方案維持待選範圍且不產生無效金額", () => {
  assert.throws(() => quote("unknown"), /不支援的委託類型/);
  for (const chibiPlan of ["unknown", "constructor", "__proto__"]) {
    assert.deepEqual(amounts(quote("chibi", { chibiPlan })), [600, 1400]);
  }
});
