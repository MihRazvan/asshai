export default async function IntentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main>
      <h1>Intent {id}</h1>
      <p>Plan view will be wired after the agent chain is implemented.</p>
    </main>
  );
}

