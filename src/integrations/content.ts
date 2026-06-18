export const LOCALAPP_AGENT_INSTRUCTIONS = `# LocalApp localhost workflow

Use LocalApp as the first source of truth for localhost services.

- Inspect services with \`localapp ls --all --json\` before using lsof, ps, grep, or curl.
- Launch a development server with \`localapp run --note "what you are building" -- <command>\`.
- reuse a healthy service reported by LocalApp instead of opening a duplicate port.
- Use the reported preview URL when handing a service to another coding agent.
- If LocalApp cannot identify or launch the service, fall back to normal system tools and say why.
`;

export function cursorRuleContent(): string {
  return `---
description: Use LocalApp for localhost discovery and service launch
alwaysApply: true
---

${LOCALAPP_AGENT_INSTRUCTIONS}`;
}
