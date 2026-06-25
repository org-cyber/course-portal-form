import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { supabaseServer } from '../../../../lib/supabase';

const RESEND_FROM = 'noreply@apply.easternpolytechnic.org';

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;

  const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(body)
    .digest('hex');

  return hash === signature;
}

async function sendConfirmationEmail(
  to: string,
  name: string,
  ref: string,
  amount: number,
  courseName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const naira = (amount / 100).toFixed(2);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to,
        subject: 'Eastern Polytechnic — Application Payment Confirmed',
        html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a365d; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
    .detail { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #1a365d; }
    .detail p { margin: 5px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 0.85rem; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Eastern Polytechnic</h1>
      <p>Online Admission Portal</p>
    </div>
    <div class="content">
      <h2>Hi ${name},</h2>
      <p>Your application payment has been received and confirmed.</p>
      <div class="detail">
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Amount Paid:</strong> ₦${naira}</p>
        <p><strong>Programme:</strong> ${courseName}</p>
        <p><strong>Status:</strong> ✅ PAID</p>
      </div>
      <p>Please keep this reference number safe. You will need it for any enquiries regarding your application.</p>
      <p>If you have any questions, contact the admissions office.</p>
    </div>
    <div class="footer">
      <p>Eastern Polytechnic &mdash; 2025/2026 Session</p>
      <p>This is an automated message. Please do not reply.</p>
    </div>
  </div>
</body>
</html>`,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.message || `Resend HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-paystack-signature');
  const body = await request.text();

  // CRITICAL: Verify webhook signature (uncommented for production)
  if (!verifySignature(body, signature)) {
    console.error('Invalid Paystack webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { reference, amount, status: paystackStatus } = event.data;

  // IDEMPOTENCY: Check if already processed
  const { data: existing } = await supabaseServer
    .from('payment_logs')
    .select('id, email_sent')
    .eq('paystack_reference', reference)
    .single();

  if (existing) {
    // Already processed — if email wasn't sent, try again
    if (!existing.email_sent) {
      const { data: app } = await supabaseServer
        .from('applications')
        .select('email, full_name, course_id, expected_amount')
        .eq('paystack_reference', reference)
        .single();

      if (app) {
        const courseName = event.data.metadata?.course_name || app.course_id;
        const emailResult = await sendConfirmationEmail(
          app.email,
          app.full_name,
          reference,
          app.expected_amount,
          courseName
        );

        if (emailResult.success) {
          await supabaseServer
            .from('payment_logs')
            .update({ email_sent: true, email_sent_at: new Date().toISOString() })
            .eq('paystack_reference', reference);
        }
      }
    }
    return NextResponse.json({ received: true, processed: true }, { status: 200 });
  }

  const { data: app } = await supabaseServer
    .from('applications')
    .select('*')
    .eq('paystack_reference', reference)
    .eq('status', 'PENDING_PAYMENT')
    .single();

  if (!app) {
    return NextResponse.json({ received: true, note: 'No pending application' }, { status: 200 });
  }

  if (app.expected_amount !== amount) {
    await supabaseServer
      .from('applications')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', app.id);

    return NextResponse.json({ received: true, error: 'Amount mismatch' }, { status: 200 });
  }

  const { data: updated, error: updateErr } = await supabaseServer
    .from('applications')
    .update({
      status: 'PAID',
      updated_at: new Date().toISOString(),
    })
    .eq('id', app.id)
    .eq('status', 'PENDING_PAYMENT')
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ received: true, note: 'Race condition' }, { status: 200 });
  }

  // Insert payment log first (before email, so we have a record)
  const { error: logErr } = await supabaseServer.from('payment_logs').insert({
    application_id: app.id,
    paystack_reference: reference,
    amount_paid: amount,
    payment_status: paystackStatus,
    paystack_metadata: event.data,
    email_sent: false,
  });

  if (logErr) {
    console.error('Failed to insert payment log:', logErr);
  }

  // Send email
  const courseName = event.data.metadata?.course_name || app.course_id;
  const emailResult = await sendConfirmationEmail(
    app.email,
    app.full_name,
    reference,
    amount,
    courseName
  );

  if (emailResult.success) {
    await supabaseServer
      .from('payment_logs')
      .update({ email_sent: true, email_sent_at: new Date().toISOString() })
      .eq('paystack_reference', reference);
  } else {
    console.error('Email send failed:', emailResult.error);
    // Webhook still returns 200 — Paystack will retry and we'll try again
  }

  return NextResponse.json({ received: true, processed: true }, { status: 200 });
}
