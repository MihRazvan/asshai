const conditionalPatterns = [
  /\bif\b/,
  /\bwhen\b/,
  /\bwhenever\b/,
  /\bbelow\b/,
  /\babove\b/,
  /\bdrops?\b/,
  /\brises?\b/,
  /\brebalance\b/,
  /\bmonitor\b/,
  /\btrigger\b/,
  /\bautomatically\b/,
];

const splitPatterns = [
  /\bsplit\b/,
  /\bdiversify\b/,
  /\btwo\b/,
  /\bmultiple\b/,
  /\bseveral\b/,
  /\b50\s*\/\s*50\b/,
  /\bhalf\b/,
  /\bbetween\b/,
];

const unsupportedTokenPatterns = [
  /\busdt\b/,
  /\bdai\b/,
  /\beth\b/,
  /\bweth\b/,
  /\bwbtc\b/,
  /\bbtc\b/,
  /\bbitcoin\b/,
  /\bsol\b/,
  /\bsolana\b/,
];

const stablecoinPatterns = [
  /\busdc\b/,
  /\bstablecoin\b/,
  /\bstablecoins\b/,
  /\bstables\b/,
];

function matchesAny(goal, patterns) {
  return patterns.some((pattern) => pattern.test(goal));
}

function goalForConditionalChecks(goal) {
  return goal.replace(/\bif possible\b/g, "").replace(/\beven if\b/g, "even though");
}

export function classifyGoalSupport(goal) {
  const normalizedGoal = goal.trim().toLowerCase().replace(/\s+/g, " ");
  const conditionalGoal = goalForConditionalChecks(normalizedGoal);
  const warnings = [];

  if (!normalizedGoal) {
    return {
      supported: false,
      reason: "Enter a stablecoin yield goal first.",
      warnings,
      normalizedGoal,
    };
  }

  if (matchesAny(conditionalGoal, conditionalPatterns)) {
    return {
      supported: false,
      reason: "Conditional automation is not supported yet. Try a one-time USDC yield allocation instead.",
      warnings,
      normalizedGoal,
    };
  }

  if (matchesAny(normalizedGoal, splitPatterns)) {
    return {
      supported: false,
      reason: "Split or multi-venue allocations are not supported yet. Try a single-allocation USDC yield goal.",
      warnings,
      normalizedGoal,
    };
  }

  if (matchesAny(normalizedGoal, unsupportedTokenPatterns)) {
    return {
      supported: false,
      reason: "Only USDC/stablecoin yield goals are supported in v1.",
      warnings,
      normalizedGoal,
    };
  }

  if (/\bethereum\b|\bmainnet\b/.test(normalizedGoal)) {
    return {
      supported: false,
      reason: "Ethereum destination venues are not verified yet. Base Aave USDC is the current supported yield route.",
      warnings,
      normalizedGoal,
    };
  }

  if (!matchesAny(normalizedGoal, stablecoinPatterns)) {
    warnings.push("No source asset was specified; v1 assumes Arbitrum USDC.");
  }

  const apyTarget = normalizedGoal.match(/(\d+(?:\.\d+)?)\s*%/);
  if (apyTarget && Number(apyTarget[1]) > 4) {
    warnings.push("Requested APY may be above available verified venues; the compiler should choose the best available option.");
  }

  return {
    supported: true,
    warnings,
    normalizedGoal,
  };
}
