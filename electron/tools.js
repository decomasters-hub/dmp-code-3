import { normalizeTools, toolsSummary } from '../src/lib/toolPolicy.js';

// Re-exported so runtime.js has a single import point.
export { normalizeTools, toolsSummary };

// Per-agent tool policy is enforced through OpenCode V2 session permissions.
// Role presets live in src/lib/toolPolicy.js (shared with the renderer).

// Build the session Ruleset for an agent rooted at agentDir.
//
// HARD-EARNED CONSTRAINT (verified across 10+ live trials): at session
// level, only the LAST rule takes effect — it acts as the session default
// policy. Specific denies are void whenever a later allow-all exists, and
// without a trailing allow-all the provider call itself 403s. Real
// per-agent confinement therefore belongs in custom OpenCode agents
// (agent-level rules, which do gate tools — verified with the read-only
// `explore` agent), not here.
//
// Until custom agents exist, sessions run permissive (generation works)
// and the runtime directive + transcript receipts provide behavioral
// guidance and visibility — NOT enforcement. Do not claim otherwise.
export function buildPermissions(tools, agentDir) {
  void tools;
  void agentDir;
  return [{ action: '*', resource: '*', effect: 'allow' }];
}
