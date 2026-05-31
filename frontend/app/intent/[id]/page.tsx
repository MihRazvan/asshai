export default async function IntentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main>
      <h1>Compiled intent {id}</h1>
      <p>StandardOrder view will be wired after the agent chain is implemented.</p>
    </main>
  );
}
