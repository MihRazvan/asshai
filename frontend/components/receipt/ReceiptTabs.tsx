"use client";

import { ExecutionTab } from "@/components/receipt/ExecutionTab";
import type { InspectorPayload } from "@/components/receipt/InspectorDrawer";
import { PlanTab } from "@/components/receipt/PlanTab";
import { RawTab } from "@/components/receipt/RawTab";
import { ReasoningTab } from "@/components/receipt/ReasoningTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const tabTriggerClass =
  "rounded-none border-0 bg-transparent px-0 pb-2 font-serif text-lg text-white/42 shadow-none transition-colors hover:text-white data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none";

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
    <Tabs className="mx-auto mt-4 w-full max-w-[72rem]" defaultValue="reasoning">
      <TabsList className="h-auto justify-start gap-7 rounded-none border-0 bg-transparent p-0">
        <TabsTrigger className={tabTriggerClass} value="reasoning">
          Reasoning
        </TabsTrigger>
        <TabsTrigger className={tabTriggerClass} value="plan">
          Plan
        </TabsTrigger>
        <TabsTrigger className={tabTriggerClass} value="execution">
          Execution
        </TabsTrigger>
        <TabsTrigger className={tabTriggerClass} value="raw">
          Raw
        </TabsTrigger>
      </TabsList>
      <TabsContent value="reasoning" className="mt-4">
        <ReasoningTab
          selectedVenue={selectedVenue}
          selectedRate={selectedRate}
          decision={decision}
          venuesById={venuesById}
          ratesById={ratesById}
          onInspect={onInspect}
        />
      </TabsContent>
      <TabsContent value="plan" className="mt-4">
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
      </TabsContent>
      <TabsContent value="execution" className="mt-4">
        <ExecutionTab
          sourceAmount={sourceAmount}
          venueLabel={selectedVenue?.label}
          venuePoolId={selectedVenue?.poolId}
          positionSymbol={selectedVenue?.positionTokenSymbol}
          execution={execution}
          steps={steps}
          onInspect={onInspect}
        />
      </TabsContent>
      <TabsContent value="raw" className="mt-4">
        <RawTab sections={rawSections} />
      </TabsContent>
    </Tabs>
  );
}
