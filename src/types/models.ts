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
}

export interface IReview {
  score?: number;
  feedback?: string;
  validatedAt?: Date;
}

export interface ITrip extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  request: string;
  tripSpec: ITripSpec;
  itinerary: IItinerary;
  budget: IBudget;
  review?: IReview;
  createdAt: Date;
  updatedAt: Date;
}
