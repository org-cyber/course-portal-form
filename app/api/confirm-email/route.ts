import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase';
import { COURSES } from '../../../lib/types';

const MAIL_API_URL = 'https://apply.easternpolytechnic.org/send-mail.php';
const MAIL_API_KEY = process.env.MAIL_API_KEY || '';
const FROM_EMAIL = 'noreply@apply.easternpolytechnic.org';

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(MAIL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': MAIL_API_KEY,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function sendCandidateEmail(
  to: string,
  name: string,
  ref: string,
  amount: number,
  courseName: string
): Promise<{ success: boolean; error?: string }> {
  const naira = (amount / 100).toFixed(2);
  const html = `<!DOCTYPE html>
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
</html>`;

  return sendEmail(to, 'Eastern Polytechnic — Application Payment Confirmed', html);
}

async function sendAdminEmail(
  app: any,
  ref: string,
  amount: number,
  courseName: string
): Promise<{ success: boolean; error?: string }> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return { success: false, error: 'ADMIN_EMAIL not configured' };
  }

  const naira = (amount / 100).toFixed(2);
  const docs = app.document_key
    ? Object.entries(app.document_key).map(([key, val]) => `<li><strong>${key}:</strong> ${val}</li>`).join('')
    : '<li>No documents</li>';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a365d; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
    .detail { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #c53030; }
    .detail p { margin: 5px 0; }
    .docs { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; }
    .docs ul { margin: 5px 0; padding-left: 20px; }
    .footer { text-align: center; margin-top: 20px; font-size: 0.85rem; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Application Received</h1>
      <p>Eastern Polytechnic — Admission Portal</p>
    </div>
    <div class="content">
      <p>A new application has been submitted and paid for.</p>
      <div class="detail">
        <p><strong>Full Name:</strong> ${app.full_name}</p>
        <p><strong>Email:</strong> ${app.email}</p>
        <p><strong>Phone:</strong> ${app.phone_number}</p>
        <p><strong>Date of Birth:</strong> ${app.date_of_birth}</p>
        <p><strong>Gender:</strong> ${app.gender}</p>
        <p><strong>Address:</strong> ${app.house_address}, ${app.city}, ${app.state}</p>
      </div>
      <div class="detail">
        <p><strong>Programme:</strong> ${courseName}</p>
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Amount Paid:</strong> ₦${naira}</p>
        <p><strong>Status:</strong> ✅ PAID</p>
      </div>
      <div class="docs">
        <p><strong>Uploaded Documents:</strong></p>
        <ul>${docs}</ul>
      </div>
    </div>
    <div class="footer">
      <p>Received at ${new Date().toLocaleString()}</p>
      <p>This is an automated notification from the admission portal.</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail(adminEmail, `New Application — ${app.full_name} (${courseName})`, html);
}

export async function POST(request: NextRequest) {
  try {
    const { reference } = await request.json();

    if (!reference) {
      return NextResponse.json({ error: 'Reference required' }, { status: 400 });
    }

    const { data: logData } = await supabaseServer
      .from('payment_logs')
      .select('email_sent, admin_email_sent')
      .eq('paystack_reference', reference)
      .single();

    if (logData?.email_sent && logData?.admin_email_sent) {
      return NextResponse.json({ sent: true, note: 'Both emails already sent' });
    }

    const { data: app } = await supabaseServer
      .from('applications')
      .select('email, full_name, course_id, expected_amount, document_key, date_of_birth, gender, phone_number, house_address, city, state, status')
      .eq('paystack_reference', reference)
      .single();

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (app.status !== 'PAID') {
      return NextResponse.json({ error: 'Payment not confirmed' }, { status: 400 });
    }

   const courseName = COURSES[app.course_id]?.name || app.course_id;
    let candidateOk = logData?.email_sent || false;
    let adminOk = logData?.admin_email_sent || false;

    if (!candidateOk) {
      const cRes = await sendCandidateEmail(app.email, app.full_name, reference, app.expected_amount, courseName);
      if (cRes.success) candidateOk = true;
    }

    if (!adminOk) {
      const aRes = await sendAdminEmail(app, reference, app.expected_amount, courseName);
      if (aRes.success) adminOk = true;
    }

    const updates: any = {};
    if (candidateOk) {
      updates.email_sent = true;
      updates.email_sent_at = new Date().toISOString();
    }
    if (adminOk) {
      updates.admin_email_sent = true;
      updates.admin_email_sent_at = new Date().toISOString();
    }

    if (logData) {
      await supabaseServer.from('payment_logs').update(updates).eq('paystack_reference', reference);
    } else {
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
          ...updates,
        });
      }
    }

    return NextResponse.json({
      sent: candidateOk && adminOk,
      candidateEmail: candidateOk,
      adminEmail: adminOk,
    });
  } catch (err: any) {
    console.error('Confirm email error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
