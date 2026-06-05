'use client';

import { useState, FormEvent } from 'react';
import { DOCUMENT_REQUIREMENTS } from '../lib/types';

const COURSES = [
  { id: 'nd', name: 'National Diploma (ND)' },
  { id: 'hnd', name: 'Higher National Diploma (HND)' },
  { id: 'hnd-bsc', name: 'HND To BSc / Conversion (UNICROSS)' },
  { id: 'pgd', name: 'Post Graduate Diploma (PGD) (UNICROSS)' },
  { id: 'masters', name: 'Masters Degree (UNICROSS)' },
];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const YEARS = Array.from({ length: 50 }, (_, i) => 2026 - 18 - i);

export default function Home() {
  const [form, setForm] = useState({
    program: '',
    firstName: '',
    middleName: '',
    surname: '',
    day: '',
    month: '',
    year: '',
    gender: '',
    phoneNumber: '',
    email: '',
    houseAddress: '',
    city: '',
    state: '',
  });

  const [documents, setDocuments] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedCourse = form.program;
  const docRequirements = selectedCourse ? DOCUMENT_REQUIREMENTS[selectedCourse] : [];

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleFileChange = (docKey: string, file: File | null) => {
    setDocuments((prev) => ({ ...prev, [docKey]: file }));
    if (errors[docKey]) {
      setErrors((prev) => ({ ...prev, [docKey]: '' }));
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};

    if (!form.program) e.program = 'Select a program';
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.surname.trim()) e.surname = 'Surname is required';
    if (!form.day || !form.month || !form.year) e.dateOfBirth = 'Date of birth is required';
    if (!form.gender) e.gender = 'Select gender';
    if (!form.phoneNumber.trim()) e.phoneNumber = 'Phone number is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!form.houseAddress.trim()) e.houseAddress = 'House address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.state.trim()) e.state = 'State is required';

    // Validate documents
    if (docRequirements) {
      for (const doc of docRequirements) {
        const file = documents[doc.key];
        if (doc.required && !file) {
          e[doc.key] = `${doc.label} is required`;
        } else if (file) {
          const ok = ['application/pdf', 'image/jpeg', 'image/png'];
          if (!ok.includes(file.type)) e[doc.key] = 'Only PDF, JPG, or PNG';
          if (file.size > doc.maxSizeMB * 1024 * 1024) e[doc.key] = `Max ${doc.maxSizeMB}MB`;
        }
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const uploadFile = async (file: File): Promise<string> => {
    const urlRes = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      }),
    });

    if (!urlRes.ok) {
      const err = await urlRes.json();
      throw new Error(err.error || 'Failed to get upload URL');
    }

    const { signedUrl, objectKey } = await urlRes.json();

    const upRes = await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    if (!upRes.ok) throw new Error('File upload failed');

    return objectKey;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSubmitting(true);

    try {
      // Upload all documents
      const documentKeys: Record<string, string> = {};
      for (const doc of docRequirements) {
        const file = documents[doc.key];
        if (file) {
          documentKeys[doc.key] = await uploadFile(file);
        }
      }

      // Create application
      const appRes = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          middleName: form.middleName,
          surname: form.surname,
          dateOfBirth: `${form.year}-${String(MONTHS.indexOf(form.month) + 1).padStart(2, '0')}-${String(form.day).padStart(2, '0')}`,
          gender: form.gender,
          phoneNumber: form.phoneNumber,
          email: form.email,
          houseAddress: form.houseAddress,
          city: form.city,
          state: form.state,
          courseId: form.program,
          documents: documentKeys,
        }),
      });

      if (!appRes.ok) {
        const err = await appRes.json();
        throw new Error(err.error || 'Application failed');
      }

      const { authorizationUrl } = await appRes.json();
      window.location.href = authorizationUrl;

    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>
          Online Application Portal
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Fill in your details and upload your documents to proceed.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Program */}
          <div className="form-group">
            <label>
              SELECT A PROGRAM <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <select
              value={form.program}
              onChange={(e) => {
                updateField('program', e.target.value);
                setDocuments({});
              }}
            >
              <option value="">-- Select Program --</option>
              {COURSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.program && <div className="error">{errors.program}</div>}
          </div>

          {/* Full Name */}
          <div className="form-group">
            <label>
              FULL NAME <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <input
                placeholder="First Name"
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
              />
              <input
                placeholder="Middle Name"
                value={form.middleName}
                onChange={(e) => updateField('middleName', e.target.value)}
              />
              <input
                placeholder="Surname"
                value={form.surname}
                onChange={(e) => updateField('surname', e.target.value)}
              />
            </div>
            {(errors.firstName || errors.surname) && (
              <div className="error">{errors.firstName || errors.surname}</div>
            )}
          </div>

          {/* DOB & Gender */}
          <div className="form-group">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>
                  DATE OF BIRTH <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <select value={form.day} onChange={(e) => updateField('day', e.target.value)}>
                    <option value="">Day</option>
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={form.month} onChange={(e) => updateField('month', e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={form.year} onChange={(e) => updateField('year', e.target.value)}>
                    <option value="">Year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {errors.dateOfBirth && <div className="error">{errors.dateOfBirth}</div>}
              </div>

              <div>
                <label>
                  GENDER <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <select value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                  <option value="">-- Select Gender --</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                {errors.gender && <div className="error">{errors.gender}</div>}
              </div>
            </div>
          </div>

          {/* Phone & Email */}
          <div className="form-group">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>
                  PHONE NUMBER <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={form.phoneNumber}
                  onChange={(e) => updateField('phoneNumber', e.target.value)}
                />
                {errors.phoneNumber && <div className="error">{errors.phoneNumber}</div>}
              </div>

              <div>
                <label>
                  EMAIL ADDRESS <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
                {errors.email && <div className="error">{errors.email}</div>}
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="form-group">
            <label>
              CONTACT ADDRESS <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <input
              placeholder="House Address"
              value={form.houseAddress}
              onChange={(e) => updateField('houseAddress', e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input
                placeholder="City"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
              />
              <input
                placeholder="State"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
              />
            </div>
            {(errors.houseAddress || errors.city || errors.state) && (
              <div className="error">{errors.houseAddress || errors.city || errors.state}</div>
            )}
          </div>

          {/* Dynamic Documents */}
          {docRequirements && docRequirements.length > 0 && (
            <div className="form-group">
              <label style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                REQUIRED DOCUMENTS <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              {docRequirements.map((doc) => (
                <div key={doc.key} style={{ marginBottom: '1.5rem' }}>
                  <label>
                    {doc.label}
                    {doc.required ? (
                      <span style={{ color: 'var(--error)' }}>*</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}> (Optional)</span>
                    )}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)}
                  />
                  <div className="file-info">
                    Max {doc.maxSizeMB}MB. PDF, JPG, or PNG.
                  </div>
                  {documents[doc.key] && (
                    <div className="file-info" style={{ color: 'var(--primary)' }}>
                      {documents[doc.key]?.name} ({((documents[doc.key]?.size || 0) / 1024).toFixed(0)} KB)
                    </div>
                  )}
                  {errors[doc.key] && <div className="error">{errors[doc.key]}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="error"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#fef2f2',
                borderRadius: 'var(--radius)',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={submitting}>
            {submitting && <span className="loading" />}
            {submitting ? 'Processing...' : 'SUBMIT APPLICATION'}
          </button>
        </form>
      </div>
    </div>
  );
}
