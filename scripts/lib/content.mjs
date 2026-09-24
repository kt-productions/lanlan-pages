import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./paths.mjs";

export async function readContent(relative) {
  return JSON.parse(await readFile(path.join(root, "content", relative), "utf8"));
}

// 只有經確認的款式可成為計價輸入；私人來源存檔不放入公開專案。
// 建置與測試共用解析，避免測試自行建出與網站不同的價格資料。
export function prepareStickerOptions(options) {
  const numbers = new Set();
  return options
    .filter((item) => !item.needsReview)
    .map((item) => {
      // 金額後可能附有半價或發光效果說明，只解析貨幣符號之前的數字。
      const match = item.label.match(/\.\.\.\s*(\d+)\s*💵(?:\s|$)/u);
      if (!Number.isInteger(item.number) || item.number < 1 || numbers.has(item.number) || !match) {
        throw new Error(`貼圖來源格式有誤或編號重複：${item.number}`);
      }
      numbers.add(item.number);
      return { ...item, price: Number(match[1]) };
    });
}

export async function readCommission() {
  const config = await readContent("commission.json");
  return {
    ...config,
    stickerOptions: prepareStickerOptions(await readContent("forms/sticker-options.json")),
  };
}
