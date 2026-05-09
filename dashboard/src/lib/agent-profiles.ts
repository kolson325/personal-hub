export type AgentProfile = {
  id: string;
  title: string;
  shortTitle: string;
  mission: string;
  cadence: string;
  defaultPrompt: string;
  route?: string;
};

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "bizdev",
    title: "BizDev Growth Agent",
    shortTitle: "BizDev",
    mission: "Find real Allsite expansion targets, contacts, outreach drafts, and next actions.",
    cadence: "Daily before work",
    route: "/agents/bizdev",
    defaultPrompt:
      "Create today's Allsite growth research report. Use live public web research where available, including `node scripts/research-web.mjs \"multi-site facilities snow removal landscaping Ohio Pennsylvania\"`. Return 8-12 specific businesses that fit Allsite, with company name, website, region, why they fit, likely decision-maker role/contact path, and a first-touch email/call angle. Compare against prior memory and do not repeat stale leads unless there is a new reason.",
  },
  {
    id: "devops",
    title: "DevOps Radar Agent",
    shortTitle: "DevOps",
    mission: "Turn new platform engineering ideas into simple implementation steps for your stack.",
    cadence: "Daily learning block",
    route: "/agents/devops",
    defaultPrompt:
      "Create today's DevOps research radar. Use live public web research where available, including `node scripts/research-web.mjs \"latest Octopus Jenkins Backstage Grafana Kibana DevOps platform engineering release\"`. Focus on new releases, patterns, or tools similar to Octopus/Jenkins/Backstage/Atlassian/Teams/JBoss/Grafana/Kibana. Explain why each matters, how it improves our current technology, source links, and one 30-minute implementation step. Compare against prior memory.",
  },
  {
    id: "budget",
    title: "Money Agent",
    shortTitle: "Money",
    mission: "Watch spending, find leverage, and convert money questions into one clear action.",
    cadence: "Daily money check",
    route: "/budget",
    defaultPrompt:
      "Create a money report from my dashboard budget data. Find the biggest leak or opportunity, give one 30-minute action, and remember what you already told me so you do not repeat generic advice.",
  },
  {
    id: "gmail",
    title: "Gmail Triage Agent",
    shortTitle: "Gmail",
    mission: "Find important messages, extract tasks, and draft replies without letting inbox noise run the day.",
    cadence: "Morning and afternoon",
    route: "/inbox",
    defaultPrompt:
      "Triage my inbox context. Sort urgent, reply soon, waiting, and FYI. Create action items and draft replies where useful. Compare with previous triage memory.",
  },
  {
    id: "allsite",
    title: "Allsite Ops Agent",
    shortTitle: "Allsite",
    mission: "Watch site photo submissions, issues, critical follow-ups, and vendor messages.",
    cadence: "Every few hours",
    route: "/central-hub",
    defaultPrompt:
      "Create an Allsite operations report from the dashboard data. Call out critical sites, vendors to follow up with, missing or weak photos, and draft messages. Do not repeat closed issues.",
  },
  {
    id: "combine",
    title: "THE-COMBINE Product Agent",
    shortTitle: "THE-COMBINE",
    mission: "Track product progress and recommend UI, performance, and launch improvements.",
    cadence: "Every code session",
    route: "/combine",
    defaultPrompt:
      "Review THE-COMBINE status and produce a product advancement report: what changed, biggest quality risks, top UI opportunities, and next development move.",
  },
  {
    id: "devotional",
    title: "Faith Formation Agent",
    shortTitle: "Faith",
    mission: "Turn devotional input into a reflection, prayer, and concrete obedience step.",
    cadence: "Daily",
    route: "/",
    defaultPrompt:
      "Use today's devotional and prior faith notes to create a short teaching, one prayer, and one concrete action step for today.",
  },
  {
    id: "todo",
    title: "Execution Agent",
    shortTitle: "Execution",
    mission: "Keep open loops visible, prioritize the day, and reduce decision fatigue.",
    cadence: "Morning, midday, evening",
    route: "/todo",
    defaultPrompt:
      "Turn my open tasks into an execution plan. Pick what matters, what to ignore, and the next action for each priority.",
  },
];

export const AGENT_PROFILE_BY_ID = new Map(AGENT_PROFILES.map((profile) => [profile.id, profile]));

export function isKnownAgentId(id: string) {
  return AGENT_PROFILE_BY_ID.has(id);
}
