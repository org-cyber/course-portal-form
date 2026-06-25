import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabase';
import { COURSES } from '../../../lib/types';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.debug('Application payload:', body);

    const {
      firstName,
      middleName,
      surname,
      dateOfBirth,
      gender,
      phoneNumber,
      email,
      houseAddress,
      city,
      state,
      courseId,
      documents,
    } = body;

    if (
      !firstName ||
      !surname ||
      !dateOfBirth ||
      !gender ||
      !phoneNumber ||
      !email ||
      !houseAddress ||
      !city ||
      !state ||
      !courseId ||
      !documents || Object.keys(documents).length === 0
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const course = COURSES[courseId];
    if (!course) {
      return NextResponse.json(
        { error: 'Invalid course selected' },
        { status: 400 }
      );
    }

    const paystackRef = `APP-${randomUUID()}`;

    const { data: application, error: dbError } = await supabaseServer
      .from('applications')
      .insert({
        full_name: `${firstName.trim()} ${middleName ? middleName.trim() + ' ' : ''}${surname.trim()}`,
        first_name: firstName.trim(),
        middle_name: middleName ? middleName.trim() : null,
        surname: surname.trim(),
        date_of_birth: dateOfBirth,
        gender: gender,
        phone_number: phoneNumber.trim(),
        email: email.toLowerCase().trim(),
        house_address: houseAddress.trim(),
        city: city.trim(),
        state: state.trim(),
        course_id: courseId,
        expected_amount: course.amountKobo,
        status: 'PENDING_PAYMENT',
        document_key: documents,
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

    let paystackResponse;
    try {
      paystackResponse = await fetch(
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
    } catch (fetchErr) {
      console.error('Paystack fetch error:', fetchErr);
      await supabaseServer.from('applications').delete().eq('id', application.id);
      return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 });
    }

    const paystackData = await paystackResponse.json();
    console.debug('Paystack init response:', { status: paystackResponse.status, body: paystackData });

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      await supabaseServer.from('applications').delete().eq('id', application.id);
      console.error('Paystack error:', paystackData);
      return NextResponse.json(
        { error: 'Payment initialization failed' },
        { status: 500 }
      );
    }

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
