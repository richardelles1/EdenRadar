import {
  Document, Page, View, Text, StyleSheet, Link,
} from "@react-pdf/renderer";
import type { ResearchProject } from "@shared/schema";

const VIOLET = "#7c3aed";
const LIGHT_VIOLET = "#f5f3ff";
const GRAY = "#6b7280";
const DARK = "#111827";
const MID = "#374151";
const BORDER = "#e5e7eb";
const ROW_ALT = "#f9fafb";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: DARK, padding: 40, paddingBottom: 52 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: VIOLET },
  headerLeft: { flex: 1 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: VIOLET, marginBottom: 2 },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: DARK },
  docMeta: { fontSize: 8, color: GRAY, marginTop: 3 },
  section: { marginBottom: 14 },
  sectionHeader: { backgroundColor: VIOLET, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, borderRadius: 2 },
  sectionHeaderText: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 0.5 },
  sectionBody: { paddingHorizontal: 2 },
  fieldLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  fieldValue: { fontSize: 9, color: MID, marginBottom: 8, lineHeight: 1.5 },
  fieldRow: { flexDirection: "row", gap: 16, marginBottom: 8 },
  fieldHalf: { flex: 1 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 2, marginBottom: 8, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: LIGHT_VIOLET, paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  tableHeaderCell: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: VIOLET, flex: 1 },
  tableRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { backgroundColor: ROW_ALT },
  tableCell: { fontSize: 8, color: MID, flex: 1, lineHeight: 1.4 },
  pill: { backgroundColor: LIGHT_VIOLET, borderWidth: 0.5, borderColor: VIOLET, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1.5, marginRight: 4, marginBottom: 4 },
  pillText: { fontSize: 7.5, color: VIOLET },
  pillRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  checkBox: { width: 10, height: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 1, marginRight: 5, marginTop: 0.5, backgroundColor: "white" },
  checkBoxDone: { backgroundColor: VIOLET, borderColor: VIOLET },
  checkMark: { color: "white", fontSize: 7, lineHeight: 1 },
  checkLabel: { fontSize: 9, color: MID, flex: 1, lineHeight: 1.4 },
  checkLabelDone: { color: GRAY, textDecoration: "line-through" },
  riskBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 10, fontSize: 8 },
  badgeLow: { backgroundColor: "#dcfce7", color: "#16a34a" },
  badgeMod: { backgroundColor: "#fef9c3", color: "#ca8a04" },
  badgeHigh: { backgroundColor: "#fee2e2", color: "#dc2626" },
  divider: { height: 0.5, backgroundColor: BORDER, marginVertical: 6 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { fontSize: 7, color: GRAY },
  highlight: { backgroundColor: LIGHT_VIOLET, borderLeftWidth: 2, borderLeftColor: VIOLET, padding: 6, marginBottom: 8, borderRadius: 2 },
  highlightText: { fontSize: 8.5, color: MID, lineHeight: 1.5 },
});

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

function FieldPair({ left, right }: { left: [string, string | null | undefined]; right: [string, string | null | undefined] }) {
  return (
    <View style={s.fieldRow}>
      <View style={s.fieldHalf}><Field label={left[0]} value={left[1]} /></View>
      <View style={s.fieldHalf}><Field label={right[0]} value={right[1]} /></View>
    </View>
  );
}

function Pills({ label, items }: { label: string; items: string[] | null | undefined }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.pillRow}>
        {items.map((item, i) => (
          <View key={i} style={s.pill}><Text style={s.pillText}>{item}</Text></View>
        ))}
      </View>
    </View>
  );
}

function RiskBadge({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  const badge = value === "Low" ? s.badgeLow : value === "High" ? s.badgeHigh : s.badgeMod;
  return (
    <View style={s.fieldHalf}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: "row", marginBottom: 8 }}>
        <View style={[s.riskBadge, badge]}><Text>{value}</Text></View>
      </View>
    </View>
  );
}

function SectionHeader({ num, title }: { num: number; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionHeaderText}>§{num} — {title.toUpperCase()}</Text>
    </View>
  );
}

export function ResearchBriefPDF({ project: p }: { project: ResearchProject }) {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const hasPapers = (p.keyPapers ?? []).length > 0;
  const hasDatasets = (p.datasetsUsed ?? []).length > 0;
  const hasContributors = (p.projectContributors ?? []).length > 0;
  const hasLinks = (p.supportingEvidenceLinks ?? []).length > 0;
  const hasExperiments = (p.nextExperiments ?? []).length > 0;

  return (
    <Document title={`Research Brief — ${p.title}`} author="EdenRadar">
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.brand}>EdenRadar Research Brief</Text>
            <Text style={s.docTitle}>{p.title}</Text>
            <Text style={s.docMeta}>
              {p.researchDomain ? `${p.researchDomain}  ·  ` : ""}{p.status?.replace("_", " ").toUpperCase()}  ·  Generated {today}
            </Text>
          </View>
        </View>

        {/* §1 Overview */}
        <View style={s.section}>
          <SectionHeader num={1} title="Project Overview" />
          <View style={s.sectionBody}>
            {p.description && (
              <View style={s.highlight}>
                <Text style={s.highlightText}>{p.description}</Text>
              </View>
            )}
            <FieldPair
              left={["Research Domain", p.researchDomain]}
              right={["Status", p.status?.replace("_", " ")]}
            />
            <Pills label="Keywords" items={p.keywords ?? []} />
          </View>
        </View>

        {/* §2 Research Question */}
        {(p.primaryResearchQuestion || p.hypothesis || p.scientificRationale) && (
          <View style={s.section}>
            <SectionHeader num={2} title="Research Question" />
            <View style={s.sectionBody}>
              <Field label="Primary Research Question" value={p.primaryResearchQuestion} />
              <Field label="Hypothesis" value={p.hypothesis} />
              <Field label="Scientific Rationale" value={p.scientificRationale} />
            </View>
          </View>
        )}

        {/* §3 Literature */}
        {(hasPapers || p.conflictingEvidence || p.literatureGap) && (
          <View style={s.section}>
            <SectionHeader num={3} title="Literature Context" />
            <View style={s.sectionBody}>
              {hasPapers && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={s.fieldLabel}>Key Papers</Text>
                  <View style={s.table}>
                    <View style={s.tableHeader}>
                      {["Title", "Authors", "Journal", "Year"].map((h) => (
                        <Text key={h} style={s.tableHeaderCell}>{h}</Text>
                      ))}
                    </View>
                    {(p.keyPapers ?? []).map((paper, i) => (
                      <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                        <Text style={s.tableCell}>{paper.paper_title || "—"}</Text>
                        <Text style={s.tableCell}>{paper.authors || "—"}</Text>
                        <Text style={s.tableCell}>{paper.journal || "—"}</Text>
                        <Text style={[s.tableCell, { flex: 0.4 }]}>{paper.year || "—"}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <Field label="Conflicting Evidence" value={p.conflictingEvidence} />
              <Field label="Literature Gap" value={p.literatureGap} />
            </View>
          </View>
        )}

        {/* §4 Methods */}
        {(p.methodology || p.experimentalDesign || (p.keyTechnologies ?? []).length > 0 || hasDatasets) && (
          <View style={s.section}>
            <SectionHeader num={4} title="Methods / Approach" />
            <View style={s.sectionBody}>
              <FieldPair left={["Methodology", p.methodology]} right={["", null]} />
              <Field label="Experimental Design" value={p.experimentalDesign} />
              <Pills label="Key Technologies" items={p.keyTechnologies ?? []} />
              {hasDatasets && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={s.fieldLabel}>Datasets Used</Text>
                  <View style={s.table}>
                    <View style={s.tableHeader}>
                      {["Name", "Source", "Notes"].map((h) => (
                        <Text key={h} style={s.tableHeaderCell}>{h}</Text>
                      ))}
                    </View>
                    {(p.datasetsUsed ?? []).map((d, i) => (
                      <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                        <Text style={s.tableCell}>{d.dataset_name || "—"}</Text>
                        <Text style={s.tableCell}>{d.dataset_source || "—"}</Text>
                        <Text style={s.tableCell}>{d.notes || "—"}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* §5 Data & Evidence */}
        {(p.preliminaryData || hasLinks || p.confidenceLevel) && (
          <View style={s.section}>
            <SectionHeader num={5} title="Data & Evidence" />
            <View style={s.sectionBody}>
              <Field label="Preliminary Data" value={p.preliminaryData} />
              <Field label="Confidence Level" value={p.confidenceLevel} />
              {hasLinks && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={s.fieldLabel}>Supporting Evidence Links</Text>
                  {(p.supportingEvidenceLinks ?? []).map((l, i) => (
                    <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
                      <Text style={{ fontSize: 8, color: MID, marginRight: 4 }}>·</Text>
                      <Link src={l.url} style={{ fontSize: 8, color: VIOLET }}>{l.label || l.url}</Link>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* §6 Commercialization */}
        {(p.potentialApplications || p.industryRelevance || p.patentStatus || p.startupPotential) && (
          <View style={s.section}>
            <SectionHeader num={6} title="Commercialization Signals" />
            <View style={s.sectionBody}>
              <Field label="Potential Applications" value={p.potentialApplications} />
              <FieldPair
                left={["Industry Relevance", p.industryRelevance]}
                right={["Patent Status", p.patentStatus]}
              />
              <Field label="Startup Potential" value={p.startupPotential} />
            </View>
          </View>
        )}

        {/* §7 Collaboration */}
        {(hasContributors || p.openForCollaboration != null || (p.collaborationType ?? []).length > 0) && (
          <View style={s.section}>
            <SectionHeader num={7} title="Collaboration" />
            <View style={s.sectionBody}>
              {hasContributors && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={s.fieldLabel}>Project Contributors</Text>
                  <View style={s.table}>
                    <View style={s.tableHeader}>
                      {["Name", "Institution", "Role", "Email"].map((h) => (
                        <Text key={h} style={s.tableHeaderCell}>{h}</Text>
                      ))}
                    </View>
                    {(p.projectContributors ?? []).map((c, i) => (
                      <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                        <Text style={s.tableCell}>{c.name || "—"}</Text>
                        <Text style={s.tableCell}>{c.institution || "—"}</Text>
                        <Text style={s.tableCell}>{c.role || "—"}</Text>
                        <Text style={s.tableCell}>{c.email || "—"}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <FieldPair
                left={["Open for Collaboration", p.openForCollaboration ? "Yes" : p.openForCollaboration === false ? "No" : undefined]}
                right={["", null]}
              />
              <Pills label="Collaboration Types" items={p.collaborationType ?? []} />
            </View>
          </View>
        )}

        {/* §8 Funding */}
        {(p.fundingStatus || (p.fundingSources ?? []).length > 0 || p.estimatedBudget != null) && (
          <View style={s.section}>
            <SectionHeader num={8} title="Funding" />
            <View style={s.sectionBody}>
              <FieldPair
                left={["Funding Status", p.fundingStatus]}
                right={["Estimated Budget", p.estimatedBudget != null ? `$${p.estimatedBudget.toLocaleString()}` : null]}
              />
              <Pills label="Funding Sources" items={p.fundingSources ?? []} />
            </View>
          </View>
        )}

        {/* §9 Risk */}
        {(p.technicalRisk || p.regulatoryRisk || p.keyScientificUnknowns) && (
          <View style={s.section}>
            <SectionHeader num={9} title="Risk Assessment" />
            <View style={s.sectionBody}>
              <View style={s.fieldRow}>
                <RiskBadge label="Technical Risk" value={p.technicalRisk} />
                <RiskBadge label="Regulatory Risk" value={p.regulatoryRisk} />
              </View>
              <Field label="Key Scientific Unknowns" value={p.keyScientificUnknowns} />
            </View>
          </View>
        )}

        {/* §10 Milestones */}
        {(hasExperiments || p.expectedTimeline || p.successCriteria) && (
          <View style={s.section}>
            <SectionHeader num={10} title="Next Milestones" />
            <View style={s.sectionBody}>
              {hasExperiments && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={s.fieldLabel}>Experiments / Milestones</Text>
                  {(p.nextExperiments ?? []).map((e, i) => (
                    <View key={i} style={s.checkRow}>
                      <View style={[s.checkBox, e.done ? s.checkBoxDone : {}]}>
                        {e.done && <Text style={s.checkMark}>✓</Text>}
                      </View>
                      <Text style={[s.checkLabel, e.done ? s.checkLabelDone : {}]}>{e.label}</Text>
                    </View>
                  ))}
                </View>
              )}
              <FieldPair left={["Expected Timeline", p.expectedTimeline]} right={["", null]} />
              <Field label="Success Criteria" value={p.successCriteria} />
            </View>
          </View>
        )}

        {/* §11 Discovery Card */}
        {(p.discoveryTitle || p.discoverySummary || p.technologyType || p.developmentStage) && (
          <View style={s.section}>
            <SectionHeader num={11} title="Discovery Card Preparation" />
            <View style={s.sectionBody}>
              <Field label="Discovery Title" value={p.discoveryTitle} />
              {p.discoverySummary && (
                <View style={s.highlight}>
                  <Text style={s.fieldLabel}>Discovery Summary</Text>
                  <Text style={s.highlightText}>{p.discoverySummary}</Text>
                </View>
              )}
              <FieldPair
                left={["Technology Type", p.technologyType]}
                right={["Development Stage", p.developmentStage]}
              />
              <Pills label="Seeking" items={p.projectSeeking ?? []} />
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>EdenRadar · Research Brief · {p.title}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
