export const mockSuppliers = [
  {
    id: "s1",
    company_name: "CETIN a.s.",
    ico: "04084063",
    country: "CZ",
    address: "Olšanská 2681/6, Prague 3",
    sector: "Telecom",
    website_url: "https://www.cetin.cz",
    notes: "Major telecom infrastructure provider",
    created_at: "2025-06-15T10:00:00Z",
    updated_at: "2025-12-01T14:30:00Z",
    evaluation_count: 3,
    last_evaluated: "2025-12-01",
  },
  {
    id: "s2",
    company_name: "O2 Czech Republic a.s.",
    ico: "60193336",
    country: "CZ",
    address: "Za Brumlovkou 266/2, Prague 4",
    sector: "Telecom",
    website_url: "https://www.o2.cz",
    notes: "Leading mobile operator",
    created_at: "2025-05-20T08:00:00Z",
    updated_at: "2025-11-15T09:00:00Z",
    evaluation_count: 2,
    last_evaluated: "2025-11-15",
  },
  {
    id: "s3",
    company_name: "T-Mobile Czech Republic a.s.",
    ico: "64949681",
    country: "CZ",
    address: "Tomíčkova 2144/1, Prague 4",
    sector: "Telecom",
    website_url: "https://www.t-mobile.cz",
    notes: "",
    created_at: "2025-07-01T12:00:00Z",
    updated_at: "2025-10-20T16:45:00Z",
    evaluation_count: 1,
    last_evaluated: "2025-10-20",
  },
  {
    id: "s4",
    company_name: "ČEZ, a.s.",
    ico: "45274649",
    country: "CZ",
    address: "Duhová 2/1444, Prague 4",
    sector: "Energy",
    website_url: "https://www.cez.cz",
    notes: "Largest energy company in Central Europe",
    created_at: "2025-04-10T09:00:00Z",
    updated_at: "2025-09-28T11:30:00Z",
    evaluation_count: 2,
    last_evaluated: "2025-09-28",
  },
  {
    id: "s5",
    company_name: "Škoda Auto a.s.",
    ico: "00177041",
    country: "CZ",
    address: "tř. Václava Klementa 869, Mladá Boleslav",
    sector: "Other",
    website_url: "https://www.skoda-auto.cz",
    notes: "Major automobile manufacturer",
    created_at: "2025-03-05T14:00:00Z",
    updated_at: "2025-08-12T10:00:00Z",
    evaluation_count: 1,
    last_evaluated: "2025-08-12",
  },
];

export const moduleTypes = [
  {
    key: "financial",
    name: "Financial Health",
    icon: "💰",
    description: "Credit ratings, financial statements, insolvency checks",
    estimatedTime: "~3 min",
    sources: ["Credit Bureau", "Financial DB", "Insolvency Registry"],
  },
  {
    key: "compliance",
    name: "Compliance & Legal",
    icon: "⚖️",
    description: "Legal risks, regulatory compliance status",
    estimatedTime: "~2 min",
    sources: ["Legal DB", "Court Records", "Regulatory API"],
  },
  {
    key: "sanctions",
    name: "Sanction Risks",
    icon: "🚫",
    description: "Screening against EU/US/UN sanction lists",
    estimatedTime: "~1 min",
    sources: ["EU Sanctions", "OFAC", "UN Lists"],
  },
  {
    key: "market",
    name: "Market & Reputation",
    icon: "📰",
    description: "AI analysis of news, market position, geopolitical risks",
    estimatedTime: "~4 min",
    sources: ["News API", "Market Data", "AI Analysis"],
  },
  {
    key: "esg",
    name: "Environmental & ESG",
    icon: "🌿",
    description: "Environmental impact, sustainability ratings",
    estimatedTime: "~3 min",
    sources: ["ESG Ratings", "CDP", "Sustainability DB"],
  },
  {
    key: "cyber",
    name: "Cyber Security",
    icon: "🔒",
    description: "Threat intelligence, digital risk assessment",
    estimatedTime: "~2 min",
    sources: ["Threat Intel", "DNS Records", "Dark Web"],
  },
  {
    key: "internal",
    name: "Internal Assessment",
    icon: "📋",
    description: "Internal questionnaire results and feedback",
    estimatedTime: "~1 min",
    sources: ["Internal Survey", "Feedback DB"],
  },
];

export const mockEvaluations = [
  {
    id: "e1",
    supplier_id: "s1",
    supplier_name: "CETIN a.s.",
    ico: "04084063",
    status: "completed",
    overall_score: 78,
    overall_risk_level: "MEDIUM",
    executive_summary:
      "CETIN demonstrates strong financial health with stable revenue growth. Minor compliance concerns were identified related to data protection regulations. No sanctions matches found. Market position is strong as the dominant telecom infrastructure provider. ESG scores are average with room for improvement in carbon emissions. Cyber security posture is adequate with some recommended improvements.",
    created_at: "2025-12-01T14:30:00Z",
    completed_at: "2025-12-01T14:45:00Z",
    modules: [
      { module_type: "financial", status: "completed", score: 82, risk_level: "LOW", summary: "Strong financial position with healthy cash flow", findings: ["Revenue growth of 5.2% YoY", "Debt-to-equity ratio within acceptable range", "No insolvency proceedings found", "Credit rating: A-"] },
      { module_type: "compliance", status: "completed", score: 68, risk_level: "MEDIUM", summary: "Minor compliance gaps identified", findings: ["GDPR compliance partially implemented", "Pending regulatory audit for Q1 2026", "All required licenses current"] },
      { module_type: "sanctions", status: "completed", score: 95, risk_level: "LOW", summary: "No matches on any sanction lists", findings: ["Clear on EU consolidated list", "Clear on OFAC SDN list", "Clear on UN Security Council list"] },
      { module_type: "market", status: "completed", score: 75, risk_level: "MEDIUM", summary: "Dominant market position with stable outlook", findings: ["Market leader in telecom infrastructure", "3 positive news articles in last 30 days", "No significant geopolitical risks identified"] },
      { module_type: "esg", status: "completed", score: 62, risk_level: "MEDIUM", summary: "Average ESG performance", findings: ["Carbon emissions above industry average", "Diversity initiatives in progress", "Community engagement programs active"] },
      { module_type: "cyber", status: "completed", score: 71, risk_level: "MEDIUM", summary: "Adequate cyber security posture", findings: ["SSL/TLS configuration is strong", "2 exposed services detected", "No data breaches in last 24 months"] },
    ],
  },
  {
    id: "e2",
    supplier_id: "s4",
    supplier_name: "ČEZ, a.s.",
    ico: "45274649",
    status: "completed",
    overall_score: 54,
    overall_risk_level: "HIGH",
    executive_summary:
      "ČEZ presents a mixed risk profile. While financially stable, there are significant ESG concerns related to coal operations and ongoing regulatory challenges. Cyber security posture needs improvement. The company's exposure to geopolitical risks in certain markets is notable.",
    created_at: "2025-09-28T11:30:00Z",
    completed_at: "2025-09-28T12:00:00Z",
    modules: [
      { module_type: "financial", status: "completed", score: 85, risk_level: "LOW", summary: "Very strong financial fundamentals", findings: ["Revenue: CZK 282B", "Strong cash reserves", "Investment grade rating"] },
      { module_type: "compliance", status: "completed", score: 45, risk_level: "HIGH", summary: "Multiple regulatory challenges", findings: ["Ongoing EU investigation on market practices", "Environmental regulation compliance gaps", "Pending litigation in 2 jurisdictions"] },
      { module_type: "esg", status: "completed", score: 32, risk_level: "CRITICAL", summary: "Significant ESG concerns", findings: ["Heavy reliance on coal power generation", "Carbon emissions significantly above targets", "Transition plan timeline unclear", "Water usage exceeds sector benchmarks"] },
      { module_type: "cyber", status: "completed", score: 55, risk_level: "HIGH", summary: "Below average cyber security", findings: ["Critical infrastructure protection gaps", "Outdated security protocols on 3 systems", "Incident response plan needs update"] },
    ],
  },
  {
    id: "e3",
    supplier_id: "s2",
    supplier_name: "O2 Czech Republic a.s.",
    ico: "60193336",
    status: "running",
    overall_score: null,
    overall_risk_level: null,
    executive_summary: null,
    created_at: "2026-02-27T10:00:00Z",
    completed_at: null,
    modules: [
      { module_type: "financial", status: "completed", score: 79, risk_level: "LOW", summary: "Healthy financial position", findings: ["Stable revenue base", "Moderate debt levels"] },
      { module_type: "sanctions", status: "completed", score: 98, risk_level: "LOW", summary: "No sanctions matches", findings: ["Clear on all checked lists"] },
      { module_type: "market", status: "running", score: null, risk_level: null, summary: null, findings: [] },
      { module_type: "cyber", status: "queued", score: null, risk_level: null, summary: null, findings: [] },
    ],
  },
];

export const mockReports = [
  { id: "r1", evaluation_id: "e1", supplier_name: "CETIN a.s.", overall_score: 78, modules_included: ["Financial", "Compliance", "Sanctions", "Market", "ESG", "Cyber"], generated_at: "2025-12-01T15:00:00Z" },
  { id: "r2", evaluation_id: "e2", supplier_name: "ČEZ, a.s.", overall_score: 54, modules_included: ["Financial", "Compliance", "ESG", "Cyber"], generated_at: "2025-09-28T12:30:00Z" },
];

export const monthlyEvaluations = [
  { month: "Mar", count: 2 },
  { month: "Apr", count: 3 },
  { month: "May", count: 1 },
  { month: "Jun", count: 4 },
  { month: "Jul", count: 2 },
  { month: "Aug", count: 3 },
  { month: "Sep", count: 5 },
  { month: "Oct", count: 2 },
  { month: "Nov", count: 4 },
  { month: "Dec", count: 3 },
  { month: "Jan", count: 6 },
  { month: "Feb", count: 2 },
];

export const riskDistribution = [
  { name: "Low", value: 12, fill: "hsl(142, 71%, 45%)" },
  { name: "Medium", value: 8, fill: "hsl(48, 96%, 47%)" },
  { name: "High", value: 4, fill: "hsl(25, 95%, 53%)" },
  { name: "Critical", value: 1, fill: "hsl(0, 84%, 60%)" },
];

export function getRiskColor(level: string | null): string {
  switch (level?.toUpperCase()) {
    case "LOW": return "risk-low";
    case "MEDIUM": return "risk-medium";
    case "HIGH": return "risk-high";
    case "CRITICAL": return "risk-critical";
    default: return "muted-foreground";
  }
}

export function getRiskBgClass(level: string | null): string {
  switch (level?.toUpperCase()) {
    case "LOW": return "bg-risk-low/10 text-risk-low border-risk-low/20";
    case "MEDIUM": return "bg-risk-medium/10 text-risk-medium border-risk-medium/20";
    case "HIGH": return "bg-risk-high/10 text-risk-high border-risk-high/20";
    case "CRITICAL": return "bg-risk-critical/10 text-risk-critical border-risk-critical/20";
    default: return "bg-muted text-muted-foreground";
  }
}

export function getScoreColor(score: number | null): string {
  if (score === null) return "muted-foreground";
  if (score >= 80) return "risk-low";
  if (score >= 60) return "risk-medium";
  if (score >= 40) return "risk-high";
  return "risk-critical";
}
