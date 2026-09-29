import { OpenCode } from '@opencode/sdk';

const oc = await OpenCode.create({ log: { level: 'warn', emit: (e) => console.error('[oc]', e.message) } });
try {
  const models = await oc.model.list();
  const all = models?.data ?? [];
  console.log('MODELS count:', all.length);
  console.log('FIRST:', JSON.stringify(all[0])?.slice(0, 300));
  const byProv = {};
  for (const m of all) byProv[m.providerID] = (byProv[m.providerID] || 0) + 1;
  console.log('BY PROVIDER:', JSON.stringify(byProv));
  const def = await oc.model.default().catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log('DEFAULT:', JSON.stringify(def?.data ?? def)?.slice(0, 300));
  const provs = await oc.provider.list().catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log('PROVIDERS:', JSON.stringify(provs?.data ?? provs)?.slice(0, 500));
} finally {
  await oc.close();
}
