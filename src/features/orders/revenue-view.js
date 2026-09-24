import { element, serviceNames } from "./presentation.js";
import { REVENUE_KINDS } from "./revenue.js";
import { taipeiDate } from "./contract.js";

const money = (cents) =>
  `NT$ ${(cents / 100).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}`;

export function setupRevenueReport({ api, getToken, report, openOrder }) {
  const $ = (id) => document.getElementById(id);
  const panel = $("revenue-panel");
  const year = $("revenue-year");
  const scope = $("revenue-month");
  const heading = $("revenue-heading");
  let snapshot = null;
  let generation = 0;
  let busy = false;
  let selectedYear = Number(taipeiDate(new Date().toISOString()).slice(0, 4));
  let lastTrigger = heading;
  for (let month = 1; month <= 12; month++) {
    const option = element("option", `${month} 月`);
    option.value = String(month);
    scope.append(option);
  }

  function renderDetails() {
    if (!snapshot) return;
    const missing = scope.value === "missing";
    const realized = scope.value === "realized";
    const undated = scope.value === "undated";
    let entries;
    let label;
    if (missing) {
      entries = [
        ...snapshot.undated.entries.filter((entry) => entry.kind !== "realized"),
        ...snapshot.missingQuotes.map((order) => ({ ...order, kind: "missingQuote" })),
      ];
      label = "待補資料（所有年度）";
    } else if (realized) {
      entries = snapshot.realized.entries;
      label = "真實收益明細（所有年度）";
    } else if (undated) {
      entries = snapshot.undated.entries.filter((entry) => entry.kind === "realized");
      label = "未分月份的真實收益（已認列）";
    } else {
      entries = snapshot.entries.filter(
        (entry) => scope.value === "all" || Number(entry.date.slice(5, 7)) === Number(scope.value),
      );
      label = `${snapshot.year} 年${scope.value === "all" ? "全年" : ` ${scope.value} 月`}訂單明細`;
    }
    $("revenue-detail-heading").textContent = label;
    $("revenue-details").replaceChildren(
      ...entries.map((entry) => {
        const row = element("div", "", "revenue-detail");
        const info = element("div");
        const title = element("button", entry.title, "revenue-order-link");
        title.type = "button";
        title.setAttribute("aria-label", `編輯收益：${entry.title}`);
        title.addEventListener("click", () => {
          lastTrigger = title;
          openOrder(entry.orderId);
        });
        info.append(
          title,
          element(
            "p",
            `${serviceNames[entry.service]}${entry.isArchived ? " · 已封存" : ""} · ${entry.orderId}`,
            "field-hint",
          ),
        );
        const value = element("div", "", "revenue-detail-value");
        value.append(
          element("strong", entry.kind === "missingQuote" ? "尚未設定金額" : money(entry.cents)),
          element(
            "p",
            entry.kind === "missingQuote"
              ? "設定金額後才能計入報表"
              : `${REVENUE_KINDS[entry.kind]} · ${entry.date || (entry.kind === "realized" ? "未填交稿日，已認列" : "待補日期")}`,
          ),
        );
        row.append(info, value);
        return row;
      }),
    );
    if (!entries.length)
      $("revenue-details").append(
        element("p", missing ? "目前沒有待補資料。" : "此範圍沒有可列入的收益。"),
      );
  }
  function totalRow(label, values, month = null) {
    const row = element("tr");
    const heading = element("th");
    heading.scope = "row";
    if (month) {
      const select = element("button", label, "revenue-month-link");
      select.type = "button";
      select.setAttribute("aria-label", `查看 ${month} 月收益明細`);
      select.addEventListener("click", () => {
        scope.value = String(month);
        renderDetails();
        scope.focus({ preventScroll: true });
        $("revenue-detail-heading").scrollIntoView({ block: "nearest" });
      });
      const bar = element("span", "", "revenue-bar");
      bar.setAttribute("aria-hidden", "true");
      const fill = element("span");
      fill.style.width = `${(values.total / Math.max(1, ...snapshot.months.map((item) => item.total))) * 100}%`;
      bar.append(fill);
      heading.append(select, bar);
    } else heading.textContent = label;
    row.append(heading);
    for (const key of ["realized", "temporary", "unfinished", "total"]) {
      row.append(element("td", money(values[key]), `revenue-${key}`));
    }
    return row;
  }
  function render() {
    year.replaceChildren(
      ...snapshot.years.map((value) => {
        const option = element("option", `${value} 年`);
        option.value = String(value);
        return option;
      }),
    );
    year.value = String(snapshot.year);
    $("revenue-lifetime").replaceChildren(
      ...[
        ["realized", "累計真實收益（所有年度）", snapshot.realized.cents],
        ["undated", "其中未填交稿日（已認列）", snapshot.undated.realized],
      ].map(([value, label, cents]) => {
        const item = element("div", "", "revenue-metric revenue-realized");
        const term = element("dt");
        const select = element("button", label, "revenue-order-link");
        select.type = "button";
        select.addEventListener("click", () => {
          scope.value = value;
          renderDetails();
          scope.focus({ preventScroll: true });
          $("revenue-detail-heading").scrollIntoView({ block: "nearest" });
        });
        term.append(select);
        item.append(term, element("dd", money(cents)));
        return item;
      }),
    );
    $("revenue-year-heading").textContent = `${snapshot.year} 年按日期統計`;
    $("revenue-caption").textContent = `${snapshot.year} 年每月收益 · 點選月份查看訂單`;
    $("revenue-summary").replaceChildren(
      ...[
        ["total", `${snapshot.year} 年度總計（含未完成）`],
        ["realized", "年度真實收益 · 已交稿"],
        ["temporary", "暫時收益 · 訂金"],
        ["unfinished", "未完成收益 · 餘額"],
      ].map(([key, label]) => {
        const item = element("div", "", `revenue-metric revenue-${key}`);
        item.append(element("dt", label), element("dd", money(snapshot.annual[key])));
        return item;
      }),
    );
    $("revenue-months").replaceChildren(
      ...snapshot.months.map((month) => totalRow(`${month.month} 月`, month, month.month)),
    );
    $("revenue-total").replaceChildren(totalRow("全年合計", snapshot.annual));
    $("revenue-missing").textContent =
      `所有年度待補：${snapshot.missingQuotes.length} 筆訂單未設定金額；${snapshot.undated.entries.filter((entry) => entry.kind !== "realized").length} 筆訂金或餘額缺日期，未列入年度合計。已交稿且已設定金額的訂單全部計入累計真實收益，未填交稿日也已認列。`;
    renderDetails();
    $("revenue-content").hidden = false;
  }
  async function load() {
    if (busy || !getToken()) return;
    const epoch = generation;
    busy = true;
    year.disabled = $("revenue-refresh").disabled = true;
    panel.setAttribute("aria-busy", "true");
    $("revenue-status").textContent = "正在讀取完整收益資料……";
    try {
      const data = await api("admin.revenue", { year: selectedYear }, getToken());
      if (epoch !== generation) return;
      snapshot = data;
      render();
      $("revenue-status").textContent =
        `已更新：${new Date(data.generatedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}（台灣時間） · ${data.orderCount} 筆訂單${data.excludedCancelled ? `，排除 ${data.excludedCancelled} 筆舊取消單` : ""}`;
    } catch (error) {
      if (epoch !== generation) return;
      if (["AUTH", "FORBIDDEN", "SESSION_CHANGED"].includes(error.code)) {
        report(error);
        return;
      }
      if (snapshot) {
        selectedYear = snapshot.year;
        year.value = String(selectedYear);
      }
      $("revenue-status").textContent =
        `${snapshot ? "更新失敗，目前顯示上次快照。" : "收益報表尚未載入。"}請按「更新報表」重試。${error.code === "NETWORK" ? "暫時無法連線。" : error.message}`;
    } finally {
      if (epoch === generation) {
        busy = false;
        year.disabled = $("revenue-refresh").disabled = false;
        panel.setAttribute("aria-busy", "false");
      }
    }
  }
  year.addEventListener("change", () => {
    selectedYear = Number(year.value);
    load();
  });
  scope.addEventListener("change", renderDetails);
  $("revenue-refresh").addEventListener("click", load);
  return {
    open() {
      panel.hidden = false;
      return load();
    },
    visible: () => !panel.hidden,
    focus() {
      (lastTrigger.isConnected ? lastTrigger : heading).focus({ preventScroll: true });
    },
    invalidate() {
      // 訂單編輯和讀取交錯時捨棄舊回應，不能以舊快照覆蓋剛完成的修改。
      generation++;
      busy = false;
      year.disabled = $("revenue-refresh").disabled = false;
      panel.setAttribute("aria-busy", "false");
      if (!panel.hidden) load();
    },
    clear() {
      generation++;
      snapshot = null;
      busy = false;
      panel.hidden = true;
      panel.setAttribute("aria-busy", "false");
      year.disabled = $("revenue-refresh").disabled = false;
      selectedYear = Number(taipeiDate(new Date().toISOString()).slice(0, 4));
      year.replaceChildren();
      scope.value = "realized";
      for (const id of [
        "revenue-lifetime",
        "revenue-summary",
        "revenue-months",
        "revenue-total",
        "revenue-details",
      ])
        $(id).replaceChildren();
      for (const id of [
        "revenue-status",
        "revenue-missing",
        "revenue-caption",
        "revenue-year-heading",
      ])
        $(id).textContent = "";
      $("revenue-detail-heading").textContent = "訂單明細";
      $("revenue-content").hidden = true;
      lastTrigger = heading;
    },
  };
}
