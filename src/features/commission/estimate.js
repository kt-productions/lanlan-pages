import { formatPriceRange } from "./pricing.js";
import { estimateLabel } from "./review.js";
import { populateList, populateDescription } from "../../shared/dom.js";

export function renderEstimate(config, service, selection, estimate) {
  const label = estimateLabel(estimate);
  document.querySelector("#commission-price").textContent = label;
  document.querySelector("#mobile-estimate-price").textContent = label;
  document.querySelector("#estimate-announcement").textContent = "預估金額：" + label;
  populateDescription(
    "#estimate-breakdown",
    estimate.items.map((item) => [
      item.label,
      formatPriceRange(item.min, item.max, estimate.currency),
    ]),
  );
  populateList("#estimate-notes", estimate.notes);
  const complexity = config.services[service].pricing.complexityPerCharacter;
  const complexityPercent = config.services[service].pricing.complexityPercent;
  const characterCount = Number(selection.characterCount) === 2 ? 2 : 1;
  populateList(
    "#complexity-fees",
    complexity
      ? Array.from(
          { length: characterCount },
          (_, index) =>
            `角色 ${index + 1}：+${formatPriceRange(complexity.min, complexity.max, estimate.currency)}`,
        )
      : complexityPercent
        ? [`角色複雜費：+${complexityPercent.min}% ~ ${complexityPercent.max}%（折扣與商用加價後小計）`]
        : [],
  );
}
