export type ApplicationStatus = 'PENDING_PAYMENT' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface Course {
  id: string;
  name: string;
  amountKobo: number;
}

export interface DocumentField {
  key: string;
  label: string;
  required: boolean;
  maxSizeMB: number;
}

// Course catalog with prices — ALL SET TO ₦100 FOR TESTING
// Change these back to actual prices before full production launch
export const COURSES: Record<string, Course> = {
  'nd': { id: 'nd', name: 'National Diploma (ND)', amountKobo: 10000 },
  'hnd': { id: 'hnd', name: 'Higher National Diploma (HND)', amountKobo: 10000 },
  'hnd-bsc': { id: 'hnd-bsc', name: 'HND To BSc / Conversion (UNICROSS)', amountKobo: 10000 },
  'pgd': { id: 'pgd', name: 'Post Graduate Diploma (PGD) (UNICROSS)', amountKobo: 10000 },
  'masters': { id: 'masters', name: 'Masters Degree (UNICROSS)', amountKobo: 10000 },
};

// Document requirements per course
export const DOCUMENT_REQUIREMENTS: Record<string, DocumentField[]> = {
  'nd': [
    { key: 'olevel_result', label: "O'level Result", required: true, maxSizeMB: 2 },
    { key: 'jamb_result', label: 'JAMB Result', required: false, maxSizeMB: 2 },
    { key: 'nin_slip', label: 'NIN Slip', required: true, maxSizeMB: 2 },
    { key: 'passport_picture', label: 'Passport Picture', required: true, maxSizeMB: 2 },
  ],
  'hnd': [
    { key: 'olevel_result', label: "O'level Result", required: true, maxSizeMB: 2 },
    { key: 'nin_slip', label: 'NIN Slip', required: true, maxSizeMB: 2 },
    { key: 'passport_picture', label: 'Passport Picture', required: true, maxSizeMB: 2 },
    { key: 'nd_statement', label: 'ND Statement of Result', required: true, maxSizeMB: 2 },
    { key: 'nd_certificate', label: 'ND Certificate', required: false, maxSizeMB: 2 },
    { key: 'it_certificate', label: 'I.T. Certificate', required: true, maxSizeMB: 2 },
  ],
  'hnd-bsc': [
    { key: 'olevel_result', label: "O'level Result", required: true, maxSizeMB: 2 },
    { key: 'nin_slip', label: 'NIN Slip', required: true, maxSizeMB: 2 },
    { key: 'passport_picture', label: 'Passport Picture', required: true, maxSizeMB: 2 },
    { key: 'hnd_degree_statement', label: 'HND or Degree Statement of Result', required: true, maxSizeMB: 2 },
    { key: 'hnd_degree_certificate', label: 'HND or Degree Certificate', required: false, maxSizeMB: 2 },
    { key: 'nysc_certificate', label: 'NYSC Certificate', required: false, maxSizeMB: 2 },
  ],
  'pgd': [
    { key: 'olevel_result', label: "O'level Result", required: true, maxSizeMB: 2 },
    { key: 'nin_slip', label: 'NIN Slip', required: true, maxSizeMB: 2 },
    { key: 'passport_picture', label: 'Passport Picture', required: true, maxSizeMB: 2 },
    { key: 'hnd_degree_statement', label: 'HND or Degree Statement of Result', required: true, maxSizeMB: 2 },
    { key: 'hnd_degree_certificate', label: 'HND or Degree Certificate', required: false, maxSizeMB: 2 },
    { key: 'nysc_certificate', label: 'NYSC Certificate', required: true, maxSizeMB: 2 },
  ],
  'masters': [
    { key: 'olevel_result', label: "O'level Result", required: true, maxSizeMB: 2 },
    { key: 'nin_slip', label: 'NIN Slip', required: true, maxSizeMB: 2 },
    { key: 'passport_picture', label: 'Passport Picture', required: true, maxSizeMB: 2 },
    { key: 'bachelors_pgd_certificate', label: 'Bachelors Degree OR PGD Certification', required: true, maxSizeMB: 2 },
    { key: 'nysc_certificate', label: 'NYSC Certificate', required: true, maxSizeMB: 2 },
  ],
};
