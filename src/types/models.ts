import type { Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivity {
  time: string;
  name: string;
  category: string;
  description: string;
  costEstimate?: number;
}

export interface IDay {
  day: number;
  location: string;
  activities: IActivity[];
  transport: string;
  neighborhood: string;
}

export interface IHotel {
  name: string;
  area: string;
  tier: string;
  estimatedCost: number;
}

export interface IBudget {
  total: number;
  breakdown: {
    accommodation: number;
    food: number;
    transport: number;
    activities: number;
  };
  withinBudget: boolean;
}

export interface IItinerary {
  days: IDay[];
  hotels: IHotel[];
  disclaimer?: string;
}

export interface ITripSpec {
  destination?: string;
  duration?: number;
  budget?: number;
  interests?: string[];
  travelers?: number;
  currency?: string;
}

export interface IReview {
  score?: number;
  feedback?: string;
  validatedAt?: Date;
}

export interface IPipelineStep {
  agent: string;
  section: string;
  provider: 'groq' | 'gemini';
  status: 'ok' | 'fallback';
}

export interface IValidationCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface IBuildTrace {
  runId?: string;
  pipeline: IPipelineStep[];
  checks: IValidationCheck[];
  repairCount: number;
  repairProvider?: 'groq' | 'gemini';
  validatorScore?: number;
  validatorPassed?: boolean;
}

export interface ITrip extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  request: string;
  tripSpec: ITripSpec;
  itinerary: IItinerary;
  budget: IBudget;
  review?: IReview;
  buildTrace?: IBuildTrace;
  createdAt: Date;
  updatedAt: Date;
}
