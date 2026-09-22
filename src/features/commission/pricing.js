const money = (cents) => cents / 100;

/**
 * 本機預估使用已確認規則；複雜費與轉場保留範圍，不代表正式報價。
 * @typedef {{service: "stickers"|"animation"|"chibi", stickerIds?: Array<string|number>,
 * chibiPlan?: string|null, characterCount?: string|number|null, transition?: string|null,
 * commercial?: string|null, background?: string|null, rush?: string|null, payment?: string|null}} Selection
 * @typedef {{min: number, max: number, currency: string|null, empty: boolean,
 * items: Array<{label: string, min: number, max: number}>, notes: string[], confirmed: boolean}} Estimate
 */
/** @param {Selection} selection @returns {Estimate} */
export function estimateCommission(config, selection) {
  const { service } = selection;
  if (!["stickers", "animation", "chibi"].includes(service)) {
    throw new Error("不支援的委託類型：" + service);
  }
  const pricing = config.services[service].pricing;
  const characterCount = Number(selection.characterCount) === 2 ? 2 : 1;
  let minCents = 0;
  let maxCents = 0;
  const items = [];
  const notes = [];
  let empty = false;
  function add(label, min, max = min) {
    const low = Math.round(min * 100);
    const high = Math.round(max * 100);
    minCents += low;
    maxCents += high;
    items.push({ label, min: money(low), max: money(high) });
  }

  if (service === "stickers") {
    const ids = new Set((selection.stickerIds || []).map(Number));
    const selected = config.stickerOptions.filter((item) =>
      ids.has(item.number),
    );
    const subtotal = selected.reduce((sum, item) => sum + item.price, 0);
    empty = selected.length === 0;
    add(`貼圖原價（${selected.length} 款）`, subtotal);
    const multiplier =
      selection.commercial === "yes" ? pricing.commercialMultiplier : 1;
    // 兩種折扣先併用，再套商用倍數；不可把商用價先乘二後只折一次。
    const quantity = pricing.quantityDiscounts
      .filter((tier) => selected.length >= tier.count)
      .at(-1);
    const halfPrice = selected.filter((item) =>
      pricing.halfPriceIds.includes(item.number),
    );
    const specialDiscount = halfPrice
      .slice(1)
      .reduce((sum, item) => sum + item.price / 2, 0);
    const quantityDiscount = quantity?.amount || 0;
    const discounts = quantityDiscount + specialDiscount;
    if (quantityDiscount)
      add(`滿 ${quantity.count} 張數量折扣`, -quantityDiscount);
    if (specialDiscount) add("No.33–35 第 2、3 款半價", -specialDiscount);
    if (multiplier > 1) {
      add(
        `商用加價（折扣後總價 ×${multiplier}）`,
        (subtotal - discounts) * (multiplier - 1),
      );
    }
  } else if (service === "animation") {
    add("單人角色動畫", pricing.base);
    if (characterCount === 2)
      add("雙人動畫（第二角色）", pricing.secondCharacter);
    if (selection.transition === "yes") {
      add("循環動畫加購轉場", pricing.transition.min, pricing.transition.max);
      notes.push("加購轉場費依需求估算，確切金額由繪師確認。");
    }
    if (selection.commercial === "yes") add("商業用途", pricing.commercial);
    if (selection.background === "no")
      add("單色／無背景", pricing.noBackground);
    if (selection.rush === "yes")
      add("急件", pricing.rush.min, pricing.rush.max);
  } else if (service === "chibi") {
    const plan = Object.hasOwn(pricing.plans, selection.chibiPlan)
      ? pricing.plans[selection.chibiPlan]
      : undefined;
    const amounts = Object.values(pricing.plans);
    const planMin = plan ?? Math.min(...amounts);
    const planMax = plan ?? Math.max(...amounts);
    if (plan !== undefined)
      add(selection.chibiPlan === "animated" ? "插圖＋動畫" : "插圖", plan);
    else {
      add("插圖／含動畫（方案待選）", planMin, planMax);
      notes.push("選擇插圖或插圖＋動畫後，會更新方案金額。");
    }
    if (characterCount === 2)
      add(
        `第二角色（方案原價 +${pricing.secondCharacterPercent}%）`,
        (planMin * pricing.secondCharacterPercent) / 100,
        (planMax * pricing.secondCharacterPercent) / 100,
      );
    if (selection.rush === "yes")
      add("加急插隊", pricing.rush.min, pricing.rush.max);
  }

  if (pricing.complexityPerCharacter) {
    const complexity = pricing.complexityPerCharacter;
    for (let character = 1; character <= characterCount; character++) {
      add(`角色 ${character} 複雜費`, complexity.min, complexity.max);
    }
    notes.push(
      `已按 ${characterCount} 位角色分別計入複雜費範圍；確切金額由繪師依角色設定確認。`,
    );
  }

  // 全程累加整數分，再對完整小計計算 PayPal，避免小數浮點誤差影響捨入。
  if (selection.payment === "paypal" && !empty) {
    const rate = pricing.paypalPercent;
    const lowFee = Math.round((minCents * rate.min) / 100);
    const highFee = Math.round((maxCents * rate.max) / 100);
    add(
      `PayPal 手續費（${rate.min === rate.max ? rate.min : rate.min + "–" + rate.max}%）`,
      money(lowFee),
      money(highFee),
    );
    if (rate.min !== rate.max)
      notes.push(`PayPal 費率待確認，暫以 ${rate.min}–${rate.max}% 估算。`);
  }
  const required =
    service === "animation"
      ? [
          "characterCount",
          "transition",
          "commercial",
          "background",
          "rush",
          "payment",
        ]
      : service === "chibi"
        ? ["characterCount", "chibiPlan", "rush", "payment"]
        : ["commercial", "payment"];
  if (required.some((key) => !selection[key]))
    notes.push("尚未選擇的加減價選項未計入，請完成選擇以更新預估。");
  notes.push(
    service === "stickers"
      ? "未含角色複雜費及其他客製需求；實際報價以繪師回覆為準。"
      : "其他客製需求另行報價；實際報價以繪師回覆為準。",
  );
  return {
    min: money(minCents),
    max: money(maxCents),
    currency: pricing.currency,
    empty,
    items,
    notes,
    confirmed: false,
  };
}

const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
export function formatPriceRange(min, max = min, currency = null) {
  const amount =
    min === max
      ? number.format(min)
      : `${number.format(min)}–${number.format(max)}`;
  return currency === "TWD" ? "NT$" + amount : amount + " 元";
}
