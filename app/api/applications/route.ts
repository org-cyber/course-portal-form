import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase';
import { COURSES } from '../../../lib/types';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { fullName, email, courseId, documentKey } = body;

    // Validate required fields
    if (!fullName || !email || !courseId || !documentKey) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // SERVER-SIDE PRICE CALCULATION
    // We look up the course by ID and get the price from our server-side catalog
    // The frontend never sends a price. We calculate it here.
    const course = COURSES[courseId];
    if (!course) {
      return NextResponse.json(
        { error: 'Invalid course selected' },
        { status: 400 }
      );
    }

    // Generate a unique Paystack reference
    const paystackRef = `APP-${randomUUID()}`;

    // Insert the application into the database
    const { data: application, error: dbError } = await supabaseServer
      .from('applications')
      .insert({
        full_name: fullName.trim(),
        email: email.toLowerCase().trim(),
        course_id: courseId,
        expected_amount: course.amountKobo,
        status: 'PENDING_PAYMENT',
        document_key: documentKey,
        paystack_reference: paystackRef,
      })
      .select()
      .single();

    if (dbError || !application) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save application' },
        { status: 500 }
      );
    }

    // Initialize Paystack transaction
    const paystackResponse = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: application.email,
          amount: course.amountKobo,
          reference: paystackRef,
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/success?reference=${paystackRef}`,
          metadata: {
            application_id: application.id,
            course_name: course.name,
          },
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    // If Paystack fails, delete the application record (rollback)
    if (!paystackData.status || !paystackData.data?.authorization_url) {
      await supabaseServer.from('applications').delete().eq('id', application.id);
      console.error('Paystack error:', paystackData);
      return NextResponse.json(
        { error: 'Payment initialization failed' },
        { status: 500 }
      );
    }

    // Return the Paystack payment URL to the frontend
    return NextResponse.json({
      authorizationUrl: paystackData.data.authorization_url,
      reference: paystackRef,
    });

  } catch (err) {
    console.error('Application error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}