import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.json(
      { error: 'Reference required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from('applications')
    .select('id, status, full_name, email, course_id, expected_amount, paystack_reference, created_at')
    .eq('paystack_reference', reference)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Application not found' },
      { status: 404 }
    );
  }

  let finalStatus = data.status;

  if (data.status === 'PENDING_PAYMENT') {
    try {
      const paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
        }
      );

      const paystackData = await paystackRes.json();

      if (paystackData.status && paystackData.data?.status === 'success') {
        await supabaseServer
          .from('applications')
          .update({
            status: 'PAID',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);

        finalStatus = 'PAID';
      }
    } catch (err) {
      console.error('Error checking Paystack status:', err);
    }
  }

  // Check if email was sent (for success page fallback)
  const { data: logData } = await supabaseServer
    .from('payment_logs')
    .select('email_sent')
    .eq('paystack_reference', reference)
    .single();

  return NextResponse.json({
    status: finalStatus,
    reference: data.paystack_reference,
    amount: data.expected_amount,
    courseId: data.course_id,
    fullName: data.full_name,
    email: data.email,
    createdAt: data.created_at,
    emailSent: logData?.email_sent || false,
  });
}
