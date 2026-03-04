import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { report_id } = await req.json();
    if (!report_id) throw new Error("report_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch report row
    const { data: report, error: rErr } = await supabase
      .from("reports")
      .select("id, evaluation_id, file_url")
      .eq("id", report_id)
      .single();
    if (rErr || !report) throw new Error("Report not found");
    if (report.file_url) {
      return new Response(JSON.stringify({ file_url: report.file_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch evaluation detail
    const { data: detail, error: dErr } = await supabase.rpc(
      "get_evaluation_detail",
      { p_evaluation_id: report.evaluation_id }
    );
    if (dErr) throw dErr;

    const ev = (detail as any).evaluation;
    const modules = (detail as any).modules as any[];

    // Risk color helper
    const riskColor = (level: string | null) => {
      switch (level?.toUpperCase()) {
        case "LOW": return "#22c55e";
        case "MEDIUM": return "#eab308";
        case "HIGH": return "#f97316";
        case "CRITICAL": return "#ef4444";
        default: return "#888";
      }
    };

    const moduleRows = modules
      .map(
        (m: any) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:500;text-transform:capitalize">${m.module_type}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center">${m.score ?? "—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center">
          <span style="background:${riskColor(m.risk_level)}22;color:${riskColor(m.risk_level)};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600">${m.risk_level ?? "—"}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px">${m.summary ?? ""}</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:6px 14px 14px 28px;border-bottom:2px solid #e5e7eb;font-size:12px;color:#666">
          <ul style="margin:0;padding-left:16px">${((m.findings ?? []) as string[]).map((f: string) => `<li>${f}</li>`).join("")}</ul>
        </td>
      </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Evaluation Report – ${ev.company_name}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;color:#1a1a2e;padding:0 20px">
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="margin:0;font-size:24px">Supplier Evaluation Report</h1>
    <p style="color:#666;margin:6px 0 0">${ev.company_name} · IČO ${ev.ico ?? "N/A"} · ${ev.sector ?? ""}</p>
    <p style="color:#999;font-size:13px">Generated ${new Date().toLocaleDateString("cs-CZ")}</p>
  </div>

  <div style="display:flex;gap:16px;margin-bottom:24px">
    <div style="flex:1;background:#f8f9fa;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:36px;font-weight:700;color:${riskColor(ev.overall_risk_level)}">${ev.overall_score ?? "—"}</div>
      <div style="font-size:13px;color:#666;margin-top:4px">Overall Score</div>
    </div>
    <div style="flex:1;background:#f8f9fa;border-radius:12px;padding:20px;text-align:center">
      <span style="font-size:18px;font-weight:700;color:${riskColor(ev.overall_risk_level)}">${ev.overall_risk_level ?? "—"}</span>
      <div style="font-size:13px;color:#666;margin-top:4px">Risk Level</div>
    </div>
    <div style="flex:1;background:#f8f9fa;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:18px;font-weight:700">${modules.length}</div>
      <div style="font-size:13px;color:#666;margin-top:4px">Modules</div>
    </div>
  </div>

  <h2 style="font-size:16px;margin:24px 0 8px">Executive Summary</h2>
  <p style="color:#444;line-height:1.6;font-size:14px">${ev.executive_summary ?? "No summary available."}</p>

  <h2 style="font-size:16px;margin:28px 0 12px">Module Results</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f1f5f9">
        <th style="text-align:left;padding:10px 14px;font-weight:600">Module</th>
        <th style="text-align:center;padding:10px 14px;font-weight:600">Score</th>
        <th style="text-align:center;padding:10px 14px;font-weight:600">Risk</th>
        <th style="text-align:left;padding:10px 14px;font-weight:600">Summary</th>
      </tr>
    </thead>
    <tbody>${moduleRows}</tbody>
  </table>

  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;color:#999;font-size:12px">
    VSA – Vendor Supplier Assessment · Confidential
  </div>
</body>
</html>`;

    // Upload to storage
    const filePath = `${report_id}.html`;
    const { error: uploadErr } = await supabase.storage
      .from("reports")
      .upload(filePath, new Blob([html], { type: "text/html" }), {
        upsert: true,
        contentType: "text/html",
      });
    if (uploadErr) throw uploadErr;

    // Update report record
    const { error: updateErr } = await supabase
      .from("reports")
      .update({ file_url: filePath })
      .eq("id", report_id);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ success: true, file_url: filePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
