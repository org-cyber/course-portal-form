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
    .select('status, full_name, email, course_id, expected_amount, paystack_reference, created_at')
    .eq('paystack_reference', reference)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Application not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: data.status,
    reference: data.paystack_reference,
    amount: data.expected_amount,
    courseId: data.course_id,
    fullName: data.full_name,
    email: data.email,
    createdAt: data.created_at,
  });
}