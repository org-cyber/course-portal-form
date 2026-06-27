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
      const documentKeys: Record<string, string> = {};
      for (const doc of docRequirements) {
        const file = documents[doc.key];
        if (file) {
          documentKeys[doc.key] = await uploadFile(file);
        }
      }

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
    <>
    {/* ── Header Navigation (Moved OUTSIDE the container) ── */}
      <header className="site-header">
        <div className="header-container">
          <div className="header-brand">
            <div className="header-logo">
              <img src="/logo.png" alt="Eastern Polytechnic" className="header-logo-image" />
            </div>
            
          </div>
          
          <nav className="header-nav">
            <button className="nav-btn portal-btn">
              <a href='https://easternpolytechnic.fedena.com/' className='onetime'>
              <strong>
              PORTAL</strong>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              </a>
            </button>
            <a href="https://easternpolytechnic.org/" className="nav-link">Home</a>
            <a href="https://easternpolytechnic.org/about-us/" className="nav-link">About Us</a>
            <div className="nav-dropdown">
              <button className="nav-link dropdown-toggle">
                Courses
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </button>
            </div>
            <a href="https://easternpolytechnic.org/pay-fees/" className="nav-link">Fees</a>
            <a href="https://easternpolytechnic.org/news/" className="nav-link">News</a>
            <a href="https://easternpolytechnic.org/contacts/" className="nav-link">Contact Us</a>
            <button className="nav-btn apply-btn">
              <a href='https://application.easternpolytechnic.org/' className='onetime'>
              <strong>
              APPLY NOW</strong>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
              </a>
            </button>
          </nav>
        </div>
      </header>
    <div className="container">
   

      {/* ── Card ── */}
      <div className="card">
        <form onSubmit={handleSubmit}>

          {/* ── Programme ── */}
          <div className="section-heading">
            <span>Programme</span>
          </div>

          <div className="form-group">
            <label>
              Select a Programme <span className="req">*</span>
            </label>
            <select
              value={form.program}
              onChange={(e) => {
                updateField('program', e.target.value);
                setDocuments({});
              }}
            >
              <option value="">— Choose Programme —</option>
              {COURSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.program && <div className="error">{errors.program}</div>}
          </div>

          <div className="form-divider" />

          {/* ── Personal information ── */}
          <div className="section-heading">
            <span>Personal Information</span>
          </div>

          {/* Full name */}
          <div className="form-group">
            <label>
              Full Name <span className="req">*</span>
            </label>
            <div className="grid-3">
              <div>
                <p className="sub-label">First Name</p>
                <input
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                />
              </div>
              <div>
                <p className="sub-label">Middle Name</p>
                <input
                  placeholder="Middle name"
                  value={form.middleName}
                  onChange={(e) => updateField('middleName', e.target.value)}
                />
              </div>
              <div>
                <p className="sub-label">Surname</p>
                <input
                  placeholder="Surname"
                  value={form.surname}
                  onChange={(e) => updateField('surname', e.target.value)}
                />
              </div>
            </div>
            {(errors.firstName || errors.surname) && (
              <div className="error">{errors.firstName || errors.surname}</div>
            )}
          </div>

          {/* DOB + Gender */}
          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            <div>
              <label>
                Date of Birth <span className="req">*</span>
              </label>
              <div className="grid-dob">
                <select value={form.day} onChange={(e) => updateField('day', e.target.value)}>
                  <option value="">Day</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select value={form.month} onChange={(e) => updateField('month', e.target.value)}>
                  <option value="">Month</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select value={form.year} onChange={(e) => updateField('year', e.target.value)}>
                  <option value="">Year</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              {errors.dateOfBirth && <div className="error">{errors.dateOfBirth}</div>}
            </div>

            <div>
              <label>
                Gender <span className="req">*</span>
              </label>
              <select value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                <option value="">— Select —</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <div className="error">{errors.gender}</div>}
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            <div>
              <label>
                Phone Number <span className="req">*</span>
              </label>
              <input
                type="tel"
                placeholder="+234 000 000 0000"
                value={form.phoneNumber}
                onChange={(e) => updateField('phoneNumber', e.target.value)}
              />
              {errors.phoneNumber && <div className="error">{errors.phoneNumber}</div>}
            </div>

            <div>
              <label>
                Email Address <span className="req">*</span>
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
              />
              {errors.email && <div className="error">{errors.email}</div>}
            </div>
          </div>

          <div className="form-divider" />

          {/* ── Contact address ── */}
          <div className="section-heading">
            <span>Contact Address</span>
          </div>

          <div className="form-group">
            <label>
              House Address <span className="req">*</span>
            </label>
            <input
              placeholder="Street address"
              value={form.houseAddress}
              onChange={(e) => updateField('houseAddress', e.target.value)}
            />
            {errors.houseAddress && <div className="error">{errors.houseAddress}</div>}
          </div>

          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            <div>
              <label>
                City <span className="req">*</span>
              </label>
              <input
                placeholder="City"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
              />
              {errors.city && <div className="error">{errors.city}</div>}
            </div>
            <div>
              <label>
                State <span className="req">*</span>
              </label>
              <input
                placeholder="State"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
              />
              {errors.state && <div className="error">{errors.state}</div>}
            </div>
          </div>

          {/* ── Dynamic documents ── */}
          {docRequirements && docRequirements.length > 0 && (
            <>
              <div className="form-divider" />
              <div className="section-heading">
                <span>Required Documents</span>
              </div>

              {docRequirements.map((doc) => (
                <div key={doc.key} className="doc-block">
                  <label>
                    {doc.label}
                    {doc.required ? (
                      <span className="req">*</span>
                    ) : (
                      <span className="optional">(Optional)</span>
                    )}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)}
                  />
                  <div className="file-info">
                    Max {doc.maxSizeMB}MB &mdash; PDF, JPG, or PNG accepted
                  </div>
                  {documents[doc.key] && (
                    <div className="file-chosen">
                      {documents[doc.key]?.name} ({((documents[doc.key]?.size || 0) / 1024).toFixed(0)} KB)
                    </div>
                  )}
                  {errors[doc.key] && <div className="error">{errors[doc.key]}</div>}
                </div>
              ))}
            </>
          )}

          {/* ── Global error ── */}
          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {/* ── Submit ─ */}
          <div className="submit-row">
            <button type="submit" disabled={submitting}>
              {submitting && <span className="loading" />}
              {submitting ? 'Processing…' : 'Submit Application'}
            </button>
            <p className="submit-note">
              You will be redirected to complete<br />
              payment after submission.
            </p>
          </div>

        </form>
      </div>
    </div>
          {/* ── Footer ── */}
      <footer className="site-footer">
        <div className="footer-container">
          <p>Copyright © 2026 Eastern Polytechnic. All rights reserved.</p>
        </div>
      </footer>
    </>
    
  );
}