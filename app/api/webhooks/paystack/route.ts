import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { supabaseServer } from '../../../../lib/supabase';

// Verify the webhook signature from Paystack
function verifySignature(body: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  
  const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(body)
    .digest('hex');
  
  return hash === signature;
}

export async function POST(request: NextRequest) {
  // Paystack sends the signature in this header
  const signature = request.headers.get('x-paystack-signature');
  
  // Read the raw body as text (needed for HMAC verification)
  const body = await request.text();
  
  // Verify the signature to confirm this came from Paystack
  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const event = JSON.parse(body);
  
  // We only care about successful charges
  if (event.event !== 'charge.success') {
    return NextResponse.json({ received: true }, { status: 200 });
  }
  
  const { reference, amount, status: paystackStatus } = event.data;
  
  // IDEMPOTENCY CHECK: Have we already processed this payment?
  const { data: existing } = await supabaseServer
    .from('payment_logs')
    .select('id')
    .eq('paystack_reference', reference)
    .single();
  
  if (existing) {
    // Already processed — return 200 so Paystack stops retrying
    return NextResponse.json({ received: true, processed: true }, { status: 200 });
  }
  
  // Find the pending application
  const { data: app } = await supabaseServer
    .from('applications')
    .select('*')
    .eq('paystack_reference', reference)
    .eq('status', 'PENDING_PAYMENT')
    .single();
  
  if (!app) {
    return NextResponse.json({ received: true, note: 'No pending application' }, { status: 200 });
  }
  
  // CRITICAL: Verify the amount matches what we expected (fraud prevention)
  if (app.expected_amount !== amount) {
    await supabaseServer
      .from('applications')
      .update({ status: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', app.id);
    
    return NextResponse.json({ received: true, error: 'Amount mismatch' }, { status: 200 });
  }
  
  // ATOMIC UPDATE: Only update if status is still PENDING_PAYMENT
  const { data: updated, error: updateErr } = await supabaseServer
    .from('applications')
    .update({
      status: 'PAID',
      updated_at: new Date().toISOString(),
    })
    .eq('id', app.id)
    .eq('status', 'PENDING_PAYMENT')  // Optimistic lock
    .select()
    .single();
  
  if (updateErr || !updated) {
    // Another webhook already processed this (race condition)
    return NextResponse.json({ received: true, note: 'Race condition' }, { status: 200 });
  }
  
  // Insert immutable payment log
  await supabaseServer.from('payment_logs').insert({
    application_id: app.id,
    paystack_reference: reference,
    amount_paid: amount,
    payment_status: paystackStatus,
    paystack_metadata: event.data,
  });
  
  // Fire-and-forget confirmation email
  sendEmail(app.email, app.full_name, reference, amount).catch(console.error);
  
  return NextResponse.json({ received: true, processed: true }, { status: 200 });
}

// Email function (fire-and-forget)
async function sendEmail(to: string, name: string, ref: string, amount: number) {
  const naira = (amount / 100).toFixed(2);
  
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject: 'Course Application Confirmed',
      html: `<h2>Hi ${name}</h2><p>Your payment of ₦${naira} has been received.</p><p>Reference: ${ref}</p>`,
    }),
  });
}