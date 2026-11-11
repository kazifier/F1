import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore, fmtInt, money } from "../lib/store";
import { buildProposal, SCOPE_GROUPS, SCOPE_ROWS, SCOPE_MARKS, scopeMark } from "../lib/proposal";
import { exportProposalDocx } from "../lib/proposalDocx";
import { exportProposalPdf, proposalPdfUrl } from "../lib/proposalPdf";
import type { OfferType, ScopeParty } from "../lib/types";

const OFFER_TYPES: OfferType[] = ["Techno-Commercial", "Technical", "Commercial", "Unpriced Commercial"];
const PARTIES: { party: ScopeParty; label: string }[] = [
  { party: "endUser", label: "End user" },
  { party: "client", label: "Client (EPC)" },
  { party: "ramsis", label: "Ramsis" },
];

const Field = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
  <div className="field" style={wide ? { gridColumn: "span 2" } : undefined}>
    <label>{label}</label>
    {children}
  </div>
);

export default function ProposalPage() {
  const { project, equipment, rates, logistics, sourcing, proposal, setProposal, setScopeCell } = useStore();

  const doc = useMemo(
    () => buildProposal({ project, equipment, rates, logistics, sourcing, settings: proposal }),
    [project, equipment, rates, logistics, sourcing, proposal],
  );

  const priced = doc.priced;
  const materialNos = doc.payment
    .filter((p) => p.kind === "Material")
    .map((p) => p.no)
    .join(" and ");

  // in-app preview of the finished A4 offer, before anything is downloaded
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const previewUrl = useRef<string | null>(null);

  const openPreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = proposalPdfUrl(doc);
    previewUrl.current = url;
    setPreviewSrc(url);
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewSrc("");
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Proposal preparation</h2>
          <div className="sub">
            One offer, generated from the estimate. Choose the commercial form — technical, commercial, techno-commercial
            or unpriced commercial — and the scope matrix, price schedule and payment milestones rebuild from the design,
            BOQ and logistics pages. Issue it as a Word document or a PDF.
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={openPreview} title="Review the finished A4 offer before downloading">
            Preview offer
          </button>
          <button className="btn" onClick={() => exportProposalPdf(doc)} title="A4 PDF of the same offer">
            Download PDF
          </button>
          <button className="btn btn-primary" onClick={() => void exportProposalDocx(doc)} title="Word .docx of the same offer">
            Download Word
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Offer form</h3>
          <span className="hint">{doc.title} · {doc.offerNo} Rev. {doc.revision} · {priced ? "priced" : "unpriced"}</span>
        </div>
        <div className="card-body">
          <div className="eq-tabs">
            {OFFER_TYPES.map((t) => (
              <button
                key={t}
                className={`eq-tab ${proposal.offerType === t ? "active" : ""}`}
                onClick={() => setProposal({ offerType: t })}
              >
                <span className="t">{t}</span>
                <span className="n">
                  {t === "Technical" && "Scope & technical terms only"}
                  {t === "Commercial" && "Terms & price schedule"}
                  {t === "Techno-Commercial" && "Technical + commercial in one"}
                  {t === "Unpriced Commercial" && "Terms and schedule, prices withheld"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g5" style={{ marginBottom: 14 }}>
        <div className="kpi"><div className="k">Quoted value</div><div className="v">{priced ? money(doc.totals.grand) : "Unpriced"}</div><div className="n">{doc.currency.code} · excl. VAT</div></div>
        <div className="kpi"><div className="k">Material content</div><div className="v">{money(doc.totals.material)}</div><div className="n">{doc.coverage.materialPct.toFixed(1)}% of the price</div></div>
        <div className="kpi"><div className="k">Material payments</div><div className="v">{doc.coverage.materialPaidPct.toFixed(1)}%</div><div className="n">{doc.coverage.covered ? "100% of material covered" : "material not covered"}</div></div>
        <div className="kpi"><div className="k">Scope</div><div className="v">{equipment.reduce((a, e) => a + e.qty, 0)}</div><div className="n">{fmtInt(doc.totals.weight)} kg · {equipment.length} item(s)</div></div>
        <div className="kpi"><div className="k">Delivery</div><div className="v">{proposal.deliveryWeeks} wk</div><div className="n">from PO + approved datasheet</div></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>Offer identity</h3><span className="hint">printed on the cover and every page</span></div>
          <div className="card-body">
            <div className="grid g2">
              <Field label="Offer number"><input value={proposal.offerNo} onChange={(e) => setProposal({ offerNo: e.target.value })} /></Field>
              <Field label="Revision"><input value={proposal.revision} onChange={(e) => setProposal({ revision: e.target.value })} /></Field>
              <Field label="Offer date"><input type="date" value={proposal.date} onChange={(e) => setProposal({ date: e.target.value })} /></Field>
              <Field label="Enquiry / RFQ reference"><input value={proposal.enquiryRef} onChange={(e) => setProposal({ enquiryRef: e.target.value })} placeholder={project.projectNo} /></Field>
              <Field label="Kind attention"><input value={proposal.attention} onChange={(e) => setProposal({ attention: e.target.value })} /></Field>
              <Field label="Subject"><input value={proposal.subject} onChange={(e) => setProposal({ subject: e.target.value })} placeholder="auto from the equipment list" /></Field>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Parties</h3><span className="hint">end user, EPC client and Ramsis</span></div>
          <div className="card-body">
            <div className="grid g2">
              <Field label="Client (issues the PO / EPC)"><input value={proposal.client} onChange={(e) => setProposal({ client: e.target.value })} placeholder={project.client} /></Field>
              <Field label="End user (plant owner)"><input value={proposal.endUser} onChange={(e) => setProposal({ endUser: e.target.value })} placeholder="where the equipment is installed" /></Field>
              <Field label="Client address" wide><input value={proposal.clientAddress} onChange={(e) => setProposal({ clientAddress: e.target.value })} placeholder={project.location} /></Field>
              <Field label="Ramsis contact"><input value={proposal.preparedBy} onChange={(e) => setProposal({ preparedBy: e.target.value })} /></Field>
              <Field label="Role"><input value={proposal.preparedRole} onChange={(e) => setProposal({ preparedRole: e.target.value })} /></Field>
              <Field label="Telephone"><input value={proposal.phone} onChange={(e) => setProposal({ phone: e.target.value })} /></Field>
              <Field label="Mobile"><input value={proposal.mobile} onChange={(e) => setProposal({ mobile: e.target.value })} /></Field>
              <Field label="e-mail" wide><input value={proposal.email} onChange={(e) => setProposal({ email: e.target.value })} /></Field>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Commercial basis</h3><span className="hint">drives payment milestones, validity and delivery clauses</span></div>
        <div className="card-body">
          <div className="grid g4">
            <Field label="Incoterm"><select value={logistics.incoterm} onChange={(e) => useStore.getState().setLogistics({ incoterm: e.target.value as typeof logistics.incoterm })}>{["EXW", "FOB", "CIF", "DAP", "DDP"].map((i) => <option key={i} value={i}>{i}</option>)}</select></Field>
            <Field label="Validity (days)"><input type="number" value={proposal.validityDays} onChange={(e) => setProposal({ validityDays: Number(e.target.value) })} /></Field>
            <Field label="Delivery (weeks)"><input type="number" value={proposal.deliveryWeeks} onChange={(e) => setProposal({ deliveryWeeks: Number(e.target.value) })} /></Field>
            <Field label="Payment period (days)"><input type="number" value={proposal.paymentDays} onChange={(e) => setProposal({ paymentDays: Number(e.target.value) })} /></Field>
            <Field label="Advance with PO (%)"><input type="number" step="1" value={proposal.advancePct} onChange={(e) => setProposal({ advancePct: Number(e.target.value) })} /></Field>
            <Field label="Design approval (%)"><input type="number" step="1" value={proposal.designPct} onChange={(e) => setProposal({ designPct: Number(e.target.value) })} /></Field>
            <Field label="Warranty (months / ex-works)"><div style={{ display: "flex", gap: 6 }}>
              <input type="number" value={proposal.warrantyMonths} onChange={(e) => setProposal({ warrantyMonths: Number(e.target.value) })} />
              <input type="number" value={proposal.warrantyExWeeks} onChange={(e) => setProposal({ warrantyExWeeks: Number(e.target.value) })} />
            </div></Field>
          </div>
          <div className="divider" />
          <div className="field">
            <label>Additional general notes (printed in the offer)</label>
            <textarea rows={3} value={proposal.notes} onChange={(e) => setProposal({ notes: e.target.value })} placeholder="e.g. bid bond, performance guarantee, specific end-user specification clauses" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Scope matrix — end user, client and Ramsis</h3>
          <span className="hint">two blocks · basis or limit per line · R / A / C / I / “-”</span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data" style={{ minWidth: 940 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Scope item</th>
                <th>Basis or limit</th>
                {PARTIES.map((p) => <th key={p.party} className="num">{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {SCOPE_ROWS.map((row, i) => {
                const startsGroup = i === 0 || SCOPE_ROWS[i - 1].group !== row.group;
                const group = SCOPE_GROUPS.find((g) => g.id === row.group);
                return (
                  <Fragment key={row.id}>
                    {startsGroup && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            background: "#f6eded",
                            color: "#8b1e1e",
                            fontWeight: 600,
                            fontSize: 11,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                          title={group?.note}
                        >
                          {group?.title}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="num">{i + 1}</td>
                      <td>{row.item}</td>
                      <td style={{ fontSize: 11.5, color: "#667080", maxWidth: 380 }}>{row.basis ?? "—"}</td>
                      {PARTIES.map((p) => (
                        <td key={p.party} className="num">
                          <select
                            className="btn"
                            style={{ padding: "1px 2px", fontSize: 11, minWidth: 54 }}
                            value={scopeMark(proposal, row, p.party)}
                            onChange={(e) => setScopeCell(row.id, p.party, e.target.value)}
                            title={SCOPE_MARKS.find((m) => m.mark === scopeMark(proposal, row, p.party))?.label}
                          >
                            {SCOPE_MARKS.map((m) => <option key={m.mark} value={m.mark}>{m.mark === "-" ? "—" : m.mark}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="est-note">
          Process design and guarantees are Ramsis scope; fabrication engineering and shop-level work are stated
          separately with their limits. Each line appears once — the duplicated NDE / pressure-test, heat-treatment,
          painting, internals and code-stamp rows of the old matrix are merged, and every basis or exclusion is printed
          in the offer. The end user is the plant owner, the client is the EPC that issues the purchase order, and
          Ramsis designs, manufactures, tests and delivers.
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Payment schedule — material fully funded</h3>
          <span className="hint">
            material {money(doc.coverage.material)} · {doc.coverage.materialPct.toFixed(1)}% of price · material payments {doc.coverage.materialPaidPct.toFixed(1)}%
          </span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead><tr><th>No</th><th>Milestone</th><th>Type</th><th className="num">%</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {doc.payment.map((p) => (
                <tr key={p.no}>
                  <td className="num">{p.no}</td>
                  <td>{p.trigger}</td>
                  <td><span className="pill">{p.kind}</span></td>
                  <td className="num">{p.pct.toFixed(1)}%</td>
                  <td className="num">{priced ? money(p.amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Total</td><td className="num">{doc.payment.reduce((a, p) => a + p.pct, 0).toFixed(1)}%</td><td className="num">{priced ? money(doc.payment.reduce((a, p) => a + p.amount, 0)) : "—"}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="card-body">
          <div className="grid g2">
            <Field label="Retention held (%) — bottom of the schedule">
              <input
                type="number"
                step="1"
                min={0}
                max={90}
                value={proposal.retentionPct}
                onChange={(e) => setProposal({ retentionPct: Number(e.target.value) })}
                placeholder="0"
              />
            </Field>
            <div className="est-note" style={{ margin: 0 }}>
              {proposal.retentionPct > 0
                ? `${proposal.retentionPct}% is withheld from the milestones and released on the final acceptance certificate; the milestones then total ${(100 - proposal.retentionPct).toFixed(1)}%.`
                : "Default 0% — no retention is withheld, and the milestones total 100% of the price."}
            </div>
          </div>
        </div>
        <div className="est-note">
          The material share of the quoted price is measured from the BOQ roll-up ({doc.coverage.materialPct.toFixed(1)}%).
          Milestones {materialNos} are material payments and total {doc.coverage.materialPaidPct.toFixed(1)}% — enough to
          recover 100% of the material cost before fabrication starts. The balance is released against design approval,
          monthly fabrication progress, the hydrostatic test, dispatch and the MDR.
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Price schedule</h3>
          <span className="hint">
            {priced ? `${money(doc.totals.grand)} ${logistics.incoterm === "EXW" ? "ex-works" : logistics.incoterm}` : "unpriced — prices withheld"} · excl. VAT
          </span>
        </div>
        <div className="card-body tight scroll-x">
          <table className="data">
            <thead><tr><th>Tag</th><th>Description</th><th className="num">Qty</th><th className="num">Weight (kg)</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {doc.priceRows.map((r) => (
                <tr key={`${r.tag}-${r.description}`}>
                  <td>{r.tag}</td>
                  <td>{r.description}</td>
                  <td className="num">{r.qty}</td>
                  <td className="num">{r.weight ? fmtInt(r.weight) : "—"}</td>
                  <td className="num">{priced ? money(r.unitPrice) : "—"}</td>
                  <td className="num">{priced ? money(r.amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">{fmtInt(doc.totals.weight)}</td>
                <td />
                <td className="num">{priced ? money(doc.totals.grand) : "withheld"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="est-note">
          Prices are the ex-works roll-up from the BOQ (material, fabrication, welding, testing, PWHT, painting,
          overheads, profit and freight allowance), plus the delivery leg when the incoterm is not EXW.
          {priced ? ` Amount in words: ${doc.amountInWords}.` : " Prices are issued with the priced commercial offer."}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Document contents</h3><span className="hint">{doc.sections.length} sections · cover letter + {doc.sections.length} numbered sections</span></div>
        <div className="card-body">
          <ol style={{ margin: 0, paddingLeft: 18, columns: 2, fontSize: 12 }}>
            {doc.sections.map((s) => <li key={s.no} style={{ marginBottom: 3 }}>{s.title}</li>)}
          </ol>
        </div>
        <div className="est-note">
          Cover letter, offer register, scope matrix, equipment schedule, technical clauses and the commercial terms are
          all rebuilt from the current estimate, so any change made on the design, nozzle, BOQ or logistics pages is in
          the next download.
        </div>
      </div>
      {previewOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(17,20,25,0.62)",
            display: "flex",
            flexDirection: "column",
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              color: "#fff",
              background: "#1f2328",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {doc.title} · {doc.offerNo} Rev. {doc.revision}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {doc.sections.length} sections · A4 · {doc.priced ? "priced" : "unpriced"}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <a
                href={previewSrc}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
              >
                Open in new tab
              </a>
              <button className="btn" onClick={() => exportProposalPdf(doc)}>Download PDF</button>
              <button className="btn btn-primary" onClick={closePreview}>Close</button>
            </div>
          </div>
          <iframe
            title="Offer preview"
            src={previewSrc}
            style={{ flex: 1, width: "100%", border: 0, borderRadius: 8, background: "#fff" }}
          />
        </div>
      )}
    </>
  );
}
