import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase';

export async function GET(request: NextRequest) {
  // Get the reference from the URL query string
  const searchParams = request.nextUrl.searchParams;
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.json(
      { error: 'Reference required' },
      { status: 400 }
    );
  }

  // Look up the application by Paystack reference
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

  // If status is still PENDING_PAYMENT, check with Paystack directly
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

      // If Paystack says it's successful, update our DB
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
      // Fall back to DB status if Paystack check fails
    }
  }

  return NextResponse.json({
    status: finalStatus,
    reference: data.paystack_reference,
    amount: data.expected_amount,
    courseId: data.course_id,
    fullName: data.full_name,
    email: data.email,
    createdAt: data.created_at,
  });
}