import goalPolicy from "./goal-policy.json";

export type SupportedVenue = {
  poolId: string;
  label: string;
  chainName: string;
  chainId: number;
  deliveryTokenSymbol: string;
  deliveryTokenAddress: string;
  positionTokenSymbol: string;
  positionTokenAddress: string;
  executionType: string;
  quoteEndpoint: string;
  callbackRequired: boolean;
  riskTier: string;
  riskNotes: string;
  status: string;
};

export type GoalSupportResult = {
  supported: boolean;
  reason?: string;
  unsupportedCode?: keyof typeof goalPolicy.unsupportedReasons;
  warnings: string[];
  normalizedGoal: string;
  policyVersion: string;
  source: typeof goalPolicy.source;
  intentShape: typeof goalPolicy.intentShape;
  execution: typeof goalPolicy.execution;
  compilerConstraints: string[];
  supportedVenues: SupportedVenue[];
  candidatePoolIds: string[];
};

export { goalPolicy };

function regexes(patterns: string[]) {
  return patterns.map((pattern) => new RegExp(pattern));
}

const conditionalPatterns = regexes(goalPolicy.patterns.conditional);
const splitPatterns = regexes(goalPolicy.patterns.split);
const unsupportedTokenPatterns = regexes(goalPolicy.patterns.unsupportedTokens);
const stablecoinPatterns = regexes(goalPolicy.patterns.stablecoin);
const ethereumDestinationPatterns = regexes(goalPolicy.patterns.ethereumDestination);

function matchesAny(goal: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(goal));
}

function goalForConditionalChecks(goal: string) {
  return goal.replace(/\bif possible\b/g, "").replace(/\beven if\b/g, "even though");
}

function baseResult(normalizedGoal: string, warnings: string[]): Omit<GoalSupportResult, "supported"> {
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

function unsupported(
  normalizedGoal: string,
  warnings: string[],
  code: keyof typeof goalPolicy.unsupportedReasons,
): GoalSupportResult {
  return {
    ...baseResult(normalizedGoal, warnings),
    supported: false,
    unsupportedCode: code,
    reason: goalPolicy.unsupportedReasons[code],
  };
}

export function classifyGoalSupport(goal: string): GoalSupportResult {
  const normalizedGoal = goal.trim().toLowerCase().replace(/\s+/g, " ");
  const conditionalGoal = goalForConditionalChecks(normalizedGoal);
  const warnings: string[] = [];

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
