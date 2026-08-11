export type JobState =
  | "Open"
  | "Active"
  | "Disputed"
  | "Completed"
  | "Refunded";

export type ResolveFavour = "artisan" | "customer";

export type JobRecord = {
  jobId: string;
  customer: string;
  artisan: string;
  amount: string;
  state: JobState;
  createdAt: string;
  disputeAt: string | null;
  jobHash: string;
  trade: string;
  description?: string;
  contractTxHash?: string;
};

export type Reputation = {
  artisan: string;
  completed: number;
  disputed: number;
  totalEarned: string;
};

export type SettlementEventType = "payout" | "refund" | "dispute_refund";

export type SettlementEvent = {
  id: string;
  jobId: string;
  type: SettlementEventType;
  amount: string;
  from: string;
  to: string;
  transactionHash: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
};

export type IdempotencyKey = {
  key: string;
  jobId: string;
  operation: string;
  createdAt: string;
  expiresAt: string;
};

// Artisan Management Types
export type ArtisanProfile = {
  artisanId: string;
  bio: string | null;
  experienceYears: string | null;
  education: string | null;
  certifications: unknown; // Array of certification IDs or objects
  skills: string[];
  languages: string[];
  averageRating: number;
  totalReviews: number;
  isVerified: boolean;
  isActive: boolean;
  profileCreatedAt: string;
  profileUpdatedAt: string;
};

export type ServiceCategory = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
};

export type ArtisanService = {
  id: string;
  artisanId: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: string; // Stroop amount as string
  currency: string;
  isAvailable: boolean;
  estimatedDurationMinutes: number | null;
  serviceDetails: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioItem = {
  id: string;
  artisanId: string;
  title: string;
  description: string | null;
  images: string[]; // Array of image URLs
  category: string | null;
  completionDate: string | null; // ISO date
  projectUrl: string | null;
  tags: string[];
  isFeatured: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkingHours = {
  id: string;
  artisanId: string;
  dayOfWeek: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SpecialHours = {
  id: string;
  artisanId: string;
  type: "holiday" | "vacation" | "special_closure";
  startDate: string; // ISO date
  endDate: string; // ISO date
  reason: string | null;
  createdAt: string;
};

export type ArtisanLocation = {
  id: string;
  artisanId: string;
  locationName: string;
  streetAddress: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  phoneNumber: string | null;
  isPrimary: boolean;
  isServiceLocation: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArtisanReview = {
  id: string;
  artisanId: string;
  customer: string; // Stellar public key
  jobId: string | null;
  rating: number; // 1-5
  comment: string | null;
  isVerifiedJob: boolean;
  createdAt: string;
};

export type ArtisanCertification = {
  id: string;
  artisanId: string;
  certificationName: string;
  issuingOrganization: string;
  issueDate: string; // ISO date
  expiryDate: string | null; // ISO date
  credentialUrl: string | null;
  credentialId: string | null;
  isVerified: boolean;
  createdAt: string;
};

export type AvailabilitySlot = {
  id: string;
  artisanId: string;
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  status: "available" | "booked" | "blocked";
  jobId: string | null;
  createdAt: string;
};
