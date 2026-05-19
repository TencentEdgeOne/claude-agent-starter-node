export async function onRequest(context: any) {
  return {
    ok: true,
    route: '/basic',
    invoke_route: '/invoke',
    framework: 'deepagents',
    conversation_id: context.conversation_id,
    run_id: context.run_id,
  };
}
