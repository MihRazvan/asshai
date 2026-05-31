import { IntentClient } from "./IntentClient";

export default async function IntentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <IntentClient goalId={id} />;
}
