import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { randomUUID } from 'crypto';

// Only these file types are allowed
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// 4MB maximum file size
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  try {
    // Parse the JSON body from the frontend
    const { fileName, fileType, fileSize } = await request.json();

    // Validate that all fields are present
    if (!fileName || !fileType || !fileSize) {
      return NextResponse.json(
        { error: 'Missing file metadata' },
        { status: 400 }
      );
    }

    // Validate the file type is in our allowed list
    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, JPG, or PNG allowed.' },
        { status: 400 }
      );
    }

    // Validate the file size is under 4MB
    if (fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 4MB.' },
        { status: 400 }
      );
    }

    // Create a unique, safe file path for Supabase Storage
    // Example: docs/550e8400-e29b-41d4-a716-446655440000-passport.pdf
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const objectKey = `docs/${randomUUID()}-${safeName}`;

    // Ask Supabase Storage for a signed upload URL
    // This URL is temporary and lets the browser upload directly
    const { data, error } = await supabaseServer
      .storage
      .from('applications')  // This is the bucket name you created
      .createSignedUploadUrl(objectKey);

    if (error || !data) {
      console.error('Supabase Storage error:', error);
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    // Return the signed URL and the object key to the frontend
    return NextResponse.json({
      signedUrl: data.signedUrl,
      objectKey: objectKey,
      token: data.token,
    });

  } catch (err) {
    console.error('Upload URL error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
