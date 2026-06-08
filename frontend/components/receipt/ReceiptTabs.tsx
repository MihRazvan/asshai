"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { ExecutionTab } from "@/components/receipt/ExecutionTab";
import type { InspectorPayload } from "@/components/receipt/InspectorDrawer";
import { PlanTab } from "@/components/receipt/PlanTab";
import { RawTab } from "@/components/receipt/RawTab";
import { ReasoningTab } from "@/components/receipt/ReasoningTab";
import type { AgentStep } from "@/lib/use-receipt-stream";

type Venue = {
  poolId: string;
  label: string;
  riskTier: string;
  positionTokenSymbol: string;
};

type Rate = {
  poolId?: string;
  apy?: string;
  tvlUsd?: string;
  riskTier?: string;
  lockup?: string;
  [key: string]: string | undefined;
};

type Decision = {
  poolId?: string;
  objectiveMatched?: string;
  rejectedAlternatives?: { poolId?: string; reason?: string }[];
  reasoning?: string;
};

type Execution = {
  approvalHash?: string;
  routeHash?: string;
  lifiStatus?: string;
  isDone: boolean;
  finalAmount?: string;
  buttonState: string;
};

type RawSection = {
  title: string;
  body: unknown;
};

export function ReceiptTabs({
  goalId,
  intentHash,
  sourceAmount,
  selectedVenue,
  selectedRate,
  decision,
  venuesById,
  ratesById,
  encodedIntent,
  execution,
  steps,
  rawSections,
  onInspect,
}: {
  goalId: string;
  intentHash?: string;
  sourceAmount: string;
  selectedVenue?: Venue;
  selectedRate?: Rate;
  decision?: Decision;
  venuesById: Map<string, Venue>;
  ratesById: Map<string, Rate>;
  encodedIntent?: string;
  execution: Execution;
  steps: AgentStep[];
  rawSections: RawSection[];
  onInspect: (payload: InspectorPayload) => void;
}) {
  return (
    <Tabs.Root className="receipt-tabs" defaultValue="reasoning">
      <Tabs.List className="receipt-tab-list" aria-label="Receipt detail views">
        <Tabs.Trigger value="reasoning">Reasoning</Tabs.Trigger>
        <Tabs.Trigger value="plan">Plan</Tabs.Trigger>
        <Tabs.Trigger value="execution">Execution</Tabs.Trigger>
        <Tabs.Trigger value="raw">Raw</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="reasoning" className="receipt-tab-panel">
        <ReasoningTab
          selectedVenue={selectedVenue}
          selectedRate={selectedRate}
          decision={decision}
          venuesById={venuesById}
          ratesById={ratesById}
          onInspect={onInspect}
        />
      </Tabs.Content>
      <Tabs.Content value="plan" className="receipt-tab-panel">
        <PlanTab
          goalId={goalId}
          intentHash={intentHash}
          sourceAmount={sourceAmount}
          venueLabel={selectedVenue?.label}
          venuePoolId={selectedVenue?.poolId}
          positionSymbol={selectedVenue?.positionTokenSymbol}
          finalAmount={execution.finalAmount}
          encodedIntent={encodedIntent}
          onInspect={onInspect}
        />
      </Tabs.Content>
      <Tabs.Content value="execution" className="receipt-tab-panel">
        <ExecutionTab
          sourceAmount={sourceAmount}
          venueLabel={selectedVenue?.label}
          venuePoolId={selectedVenue?.poolId}
          positionSymbol={selectedVenue?.positionTokenSymbol}
          execution={execution}
          steps={steps}
          onInspect={onInspect}
        />
      </Tabs.Content>
      <Tabs.Content value="raw" className="receipt-tab-panel">
        <RawTab sections={rawSections} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
