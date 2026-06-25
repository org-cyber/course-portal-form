import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase';

const RESEND_FROM = 'noreply@apply.easternpolytechnic.org';

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
  try {
    const { reference } = await request.json();

    if (!reference) {
      return NextResponse.json({ error: 'Reference required' }, { status: 400 });
    }

    // Check if already emailed
    const { data: logData } = await supabaseServer
      .from('payment_logs')
      .select('email_sent, email_sent_at')
      .eq('paystack_reference', reference)
      .single();

    if (logData?.email_sent) {
      return NextResponse.json({ sent: true, note: 'Already sent' });
    }

    // Get application details
    const { data: app } = await supabaseServer
      .from('applications')
      .select('email, full_name, course_id, expected_amount, status')
      .eq('paystack_reference', reference)
      .single();

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (app.status !== 'PAID') {
      return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 });
    }

    // Get course name
    const { data: courseData } = await supabaseServer
      .from('applications')
      .select('course_id')
      .eq('paystack_reference', reference)
      .single();

    const courseName = courseData?.course_id || 'Your Selected Programme';

    // Send email
    const result = await sendConfirmationEmail(
      app.email,
      app.full_name,
      reference,
      app.expected_amount,
      courseName
    );

    if (result.success) {
      // Update payment log
      if (logData) {
        await supabaseServer
          .from('payment_logs')
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq('paystack_reference', reference);
      } else {
        // No log exists yet (webhook hasn't fired) — create one
        const { data: appData } = await supabaseServer
          .from('applications')
          .select('id')
          .eq('paystack_reference', reference)
          .single();

        if (appData) {
          await supabaseServer.from('payment_logs').insert({
            application_id: appData.id,
            paystack_reference: reference,
            amount_paid: app.expected_amount,
            payment_status: 'success',
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          });
        }
      }

      return NextResponse.json({ sent: true });
    } else {
      return NextResponse.json({ sent: false, error: result.error }, { status: 500 });
    }
  } catch (err: any) {
    console.error('Confirm email error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
