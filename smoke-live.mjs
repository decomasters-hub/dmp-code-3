import { getStatus, listModels, chat, closeRuntime } from './electron/runtime.js';

// Live smoke test against the user's real OpenCode background service.
// Requires: OpenCode CLI installed + working provider auth (even free tier).
const st = await getStatus({ refresh: true });
console.log('STATUS:', st.state, `providers=${st.providers} models=${st.models} v=${st.version}`);
if (st.state !== 'connected') {
  console.log('NOT CONNECTED — stopping here.');
  await closeRuntime();
  process.exit(1);
}
const lm = await listModels();
const first = (lm.models || [])[0];
const res = await chat({
  key: 'smoke',
  text: 'Reply with exactly the word OK and nothing else.',
  title: 'smoke',
  instructions: 'Follow instructions literally.',
  model: first ? `${first.providerID}/${first.modelID ?? first.id}` : undefined,
});
console.log('CHAT:', JSON.stringify(res.text));
await closeRuntime();
process.exit(res.text.includes('OK') ? 0 : 2);
