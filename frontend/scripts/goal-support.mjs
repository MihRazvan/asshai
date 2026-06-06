import { readFileSync } from "node:fs";

export const goalPolicy = JSON.parse(
  readFileSync(new URL("../lib/goal-policy.json", import.meta.url), "utf8"),
);

function regexes(patterns) {
  return patterns.map((pattern) => new RegExp(pattern));
}

const conditionalPatterns = regexes(goalPolicy.patterns.conditional);
const splitPatterns = regexes(goalPolicy.patterns.split);
const unsupportedTokenPatterns = regexes(goalPolicy.patterns.unsupportedTokens);
const stablecoinPatterns = regexes(goalPolicy.patterns.stablecoin);
const ethereumDestinationPatterns = regexes(goalPolicy.patterns.ethereumDestination);

function matchesAny(goal, patterns) {
  return patterns.some((pattern) => pattern.test(goal));
}

function goalForConditionalChecks(goal) {
  return goal.replace(/\bif possible\b/g, "").replace(/\beven if\b/g, "even though");
}

function baseResult(normalizedGoal, warnings) {
  return {
    warnings,
    normalizedGoal,
    policyVersion: goalPolicy.version,
    source: goalPolicy.source,
    intentShape: goalPolicy.intentShape,
    execution: goalPolicy.execution,
    compilerConstraints: [...goalPolicy.compilerConstraints],
    supportedVenues: goalPolicy.supportedVenues,
    candidatePoolIds: goalPolicy.supportedVenues.map((venue) => venue.poolId),
  };
}

function unsupported(normalizedGoal, warnings, code) {
  return {
    ...baseResult(normalizedGoal, warnings),
    supported: false,
    unsupportedCode: code,
    reason: goalPolicy.unsupportedReasons[code],
  };
}

export function classifyGoalSupport(goal) {
  const normalizedGoal = goal.trim().toLowerCase().replace(/\s+/g, " ");
  const conditionalGoal = goalForConditionalChecks(normalizedGoal);
  const warnings = [];

  if (!normalizedGoal) {
    return unsupported(normalizedGoal, warnings, "empty");
  }

  if (matchesAny(conditionalGoal, conditionalPatterns)) {
    return unsupported(normalizedGoal, warnings, "conditional");
  }

  if (matchesAny(normalizedGoal, splitPatterns)) {
    return unsupported(normalizedGoal, warnings, "split");
  }

  if (matchesAny(normalizedGoal, unsupportedTokenPatterns)) {
    return unsupported(normalizedGoal, warnings, "token");
  }

  if (matchesAny(normalizedGoal, ethereumDestinationPatterns)) {
    return unsupported(normalizedGoal, warnings, "ethereumDestination");
  }

  if (!matchesAny(normalizedGoal, stablecoinPatterns)) {
    warnings.push(goalPolicy.warnings.assumedSource);
  }

  const apyTarget = normalizedGoal.match(/(\d+(?:\.\d+)?)\s*%/);
  if (apyTarget && Number(apyTarget[1]) > goalPolicy.maxVerifiedApyTargetPct) {
    warnings.push(goalPolicy.warnings.highApyTarget);
  }

  return {
    ...baseResult(normalizedGoal, warnings),
    supported: true,
  };
}
