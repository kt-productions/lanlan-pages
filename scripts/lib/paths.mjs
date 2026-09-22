import path from "node:path";
import { fileURLToPath } from "node:url";

// 以腳本位置定位專案；從其他工作目錄執行時也不能清理到外部資料。
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const output = path.join(root, "dist");

export function resolveWithin(base, relative) {
  const resolved = path.resolve(base, relative);
  const difference = path.relative(base, resolved);
  if (
    difference === ".." ||
    difference.startsWith(".." + path.sep) ||
    path.isAbsolute(difference)
  ) {
    throw new Error(`路徑不可離開指定目錄：${relative}`);
  }
  return resolved;
}
