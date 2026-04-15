// Supabase Edge Function — send-role-email
// Called directly from the frontend via supabase.functions.invoke()
//
// Required Edge Function secrets (set via Management API):
//   RESEND_API_KEY         — your Resend API key (re_xxxx)
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//
// Handles four email types:
//   "role_changed"     — admin manually changed a user's role
//   "request_approved" — admin approved a user's role request
//   "request_denied"   — admin denied a user's role request
//   "new_request"      — user submitted a role request (emailed to all admins)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://agreeable-pebble-0e9fcc610.6.azurestaticapps.net';

// ─── Email Templates ────────────────────────────────────────────────────────

function capitalize(s?: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildEmail(
  type: string,
  name: string,
  opts: {
    fromRole?: string;
    toRole?: string;
    reason?: string;
    requesterName?: string;
    requestedRole?: string;
  }
): { subject: string; html: string } {
  const { fromRole, toRole, reason, requesterName, requestedRole } = opts;

  if (type === 'role_changed') {
    return {
      subject: `Your VSA role has been updated to ${capitalize(toRole)}`,
      html: `
        <p>Hi ${name},</p>
        <p>Your role in the <strong>VSA Platform</strong> has been changed
           from <strong>${capitalize(fromRole)}</strong>
           to <strong>${capitalize(toRole)}</strong>.</p>
        <p>Your new permissions are active immediately.
           <a href="${APP_URL}">Log in to VSA</a> to continue your work.</p>
        <p style="color:#888;font-size:12px;">
          If you did not expect this change, please contact your administrator.
        </p>
      `,
    };
  }

  if (type === 'request_approved') {
    return {
      subject: `Your role request has been approved — you are now ${capitalize(toRole)}`,
      html: `
        <p>Hi ${name},</p>
        <p>Your request to become <strong>${capitalize(toRole)}</strong>
           in the VSA Platform has been <strong>approved</strong>.</p>
        <p>Your new permissions are active immediately.
           <a href="${APP_URL}">Log in to VSA</a> to get started.</p>
      `,
    };
  }

  if (type === 'request_denied') {
    return {
      subject: `Your VSA role request has not been approved`,
      html: `
        <p>Hi ${name},</p>
        <p>Your request for a role upgrade in the VSA Platform has been reviewed
           and was <strong>not approved</strong> at this time.</p>
        ${reason ? `<p>Reason: <em>${reason}</em></p>` : ''}
        <p>You can submit a new request if your circumstances change.
           If you have questions, please contact your administrator.</p>
      `,
    };
  }

  if (type === 'new_request') {
    return {
      subject: `New role request: ${requesterName} is requesting ${capitalize(requestedRole)} access`,
      html: `
        <p>A user has submitted a role upgrade request in the VSA Platform.</p>
        <ul>
          <li><strong>User:</strong> ${requesterName}</li>
          <li><strong>Requested role:</strong> ${capitalize(requestedRole)}</li>
          ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ''}
        </ul>
        <p><a href="${APP_URL}/admin">Review the request in the Admin portal</a></p>
      `,
    };
  }

  return { subject: 'VSA Platform notification', html: `<p>Hi ${name},</p><p>You have a new notification from VSA.</p>` };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // Update RESEND_FROM to your verified Resend sender address after domain verification
  const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'VSA Platform <onboarding@resend.dev>';

  if (!RESEND_API_KEY) {
    console.error('[send-role-email] RESEND_API_KEY secret is not set');
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { type } = body;
  if (!type) {
    return new Response(JSON.stringify({ error: 'Missing type field' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify caller JWT and confirm they are an admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const callerToken = authHeader.replace('Bearer ', '');
  const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(callerToken);
  if (callerError || !caller) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── new_request: any authenticated user can trigger (they are the requester)
  if (type === 'new_request') {
    const { requester_user_id, requested_role, reason } = body;

    // Caller must be the requester — prevents spoofing another user's request
    if (caller.id !== requester_user_id) {
      return new Response(JSON.stringify({ error: 'Forbidden — requester mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get requester display name
    const { data: requesterProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', requester_user_id)
      .single();

    const { data: requesterAuth } = await supabase.auth.admin.getUserById(requester_user_id);
    const requesterName = requesterProfile?.full_name || requesterAuth?.user?.email || 'Unknown user';

    // Collect all admin user IDs
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (!adminRoles || adminRoles.length === 0) {
      console.warn('[send-role-email] No admins found to notify');
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch emails for each admin and send
    const { subject, html } = buildEmail('new_request', '', {
      requesterName,
      requestedRole: requested_role,
      reason,
    });

    let sent = 0;
    for (const { user_id } of adminRoles) {
      const { data: adminAuth } = await supabase.auth.admin.getUserById(user_id);
      const email = adminAuth?.user?.email;
      if (!email) continue;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({ from: RESEND_FROM, to: [email], subject, html }),
      });

      if (res.ok) {
        sent++;
      } else {
        console.warn(`[send-role-email] Failed to email admin ${email}:`, await res.text());
      }
    }

    console.log(`[send-role-email] new_request emails sent to ${sent} admin(s)`);
    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── All other types require admin ───────────────────────────────────────
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', caller.id)
    .single();

  if (roleRow?.role !== 'admin') {
    console.warn(`[send-role-email] Non-admin tried to call type=${type}, user=${caller.id}`);
    return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Email the target user ────────────────────────────────────────────────
  const { target_user_id, from_role, to_role, reason } = body;

  if (!target_user_id) {
    return new Response(JSON.stringify({ error: 'Missing target_user_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch target user email and display name
  const { data: targetAuth } = await supabase.auth.admin.getUserById(target_user_id);
  const targetEmail = targetAuth?.user?.email;

  if (!targetEmail) {
    console.warn(`[send-role-email] No email found for user ${target_user_id} — skipping`);
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', target_user_id)
    .single();

  const displayName = targetProfile?.full_name || targetEmail;

  const { subject, html } = buildEmail(type, displayName, { fromRole: from_role, toRole: to_role, reason });

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [targetEmail], subject, html }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error(`[send-role-email] Resend error for ${type}:`, errText);
    return new Response(JSON.stringify({ error: 'Email send failed', detail: errText }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[send-role-email] ${type} email sent to ${targetEmail}`);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
