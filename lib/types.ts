export type ApplicationStatus = 'PENDING_PAYMENT' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface Course {
  id: string;
  name: string;
  amountKobo: number;
}

// This lives ONLY on the server. Never send this to the browser.
// The frontend will show course names, but prices are calculated server-side.
export const COURSES: Record<string, Course> = {
  'web-dev': { 
    id: 'web-dev', 
    name: 'Web Development Fundamentals', 
    amountKobo: 50000  // ₦500.00 in kobo
  },
  'react-advanced': { 
    id: 'react-advanced', 
    name: 'Advanced React Patterns', 
    amountKobo: 75000  // ₦750.00 in kobo
  },
  'backend-pro': { 
    id: 'backend-pro', 
    name: 'Backend Engineering Mastery', 
    amountKobo: 100000  // ₦1,000.00 in kobo
  },
};