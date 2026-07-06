export interface Scholarship {
  id: string;
  name: string;
  category: 'Academic' | 'Financial' | 'Athletic' | 'Leadership' | 'Others';
  description: string;
  benefits: string[];
  eligibility: string[];
  requirements: string[];
  process: string[];
  deadline: string;
  status: 'Open' | 'Closed' | 'Closing Soon';
}

export interface Announcement {
  id: string;
  title: string;
  date: string;
  description: string;
  content: string;
  category: 'General' | 'Update' | 'Deadline' | 'Event';
}

export interface Application {
  id: string;
  scholarshipId: string;
  scholarshipName: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    studentNumber: string;
  };
  program: string;
  yearLevel: string;
  gpa: string;
  documents: { name: string; uploaded: boolean; fileName?: string }[];
  status: 'Pending' | 'Approved' | 'Rejected' | 'Under Evaluation';
  submittedAt: string;
}

export interface StudentProfile {
  studentNumber: string;
  name: string;
  course: string;
  college: string;
  yearLevel: string;
  email: string;
  gpa: string;
  avatarUrl?: string;
}
