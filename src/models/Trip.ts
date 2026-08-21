import mongoose, { Schema } from 'mongoose';
import type { ITrip } from '../types/models.js';

const activitySchema = new Schema(
  {
    time: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    costEstimate: { type: Number },
  },
  { _id: false }
);

const daySchema = new Schema(
  {
    day: { type: Number, required: true },
    location: { type: String, required: true },
    activities: { type: [activitySchema], default: [] },
    transport: { type: String, default: '' },
    neighborhood: { type: String, default: '' },
  },
  { _id: false }
);

const hotelSchema = new Schema(
  {
    name: { type: String, required: true },
    area: { type: String, required: true },
    tier: { type: String, required: true },
    estimatedCost: { type: Number, required: true },
  },
  { _id: false }
);

const budgetSchema = new Schema(
  {
    total: { type: Number, required: true },
    breakdown: {
      accommodation: { type: Number, default: 0 },
      food: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      activities: { type: Number, default: 0 },
    },
    withinBudget: { type: Boolean, default: true },
  },
  { _id: false }
);

const itinerarySchema = new Schema(
  {
    days: { type: [daySchema], default: [] },
    hotels: { type: [hotelSchema], default: [] },
    disclaimer: { type: String, default: '' },
  },
  { _id: false }
);

const tripSpecSchema = new Schema(
  {
    destination: { type: String },
    duration: { type: Number },
    budget: { type: Number },
    interests: { type: [String], default: [] },
    travelers: { type: Number },
    currency: { type: String, default: 'USD' },
  },
  { _id: false }
);

const reviewSchema = new Schema(
  {
    score: { type: Number },
    feedback: { type: String },
    validatedAt: { type: Date },
  },
  { _id: false }
);

const pipelineStepSchema = new Schema(
  {
    agent: { type: String, required: true },
    section: { type: String, required: true },
    provider: { type: String, enum: ['groq', 'gemini'], required: true },
    status: { type: String, enum: ['ok', 'fallback'], required: true },
  },
  { _id: false }
);

const validationCheckSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ['pass', 'fail', 'warn'], required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const buildTraceSchema = new Schema(
  {
    runId: { type: String },
    pipeline: { type: [pipelineStepSchema], default: [] },
    checks: { type: [validationCheckSchema], default: [] },
    repairCount: { type: Number, default: 0 },
    repairProvider: { type: String, enum: ['groq', 'gemini'] },
    validatorScore: { type: Number },
    validatorPassed: { type: Boolean },
  },
  { _id: false }
);

const tripSchema = new Schema<ITrip>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    request: {
      type: String,
      required: [true, 'Request is required'],
    },
    tripSpec: { type: tripSpecSchema, default: {} },
    itinerary: { type: itinerarySchema, default: () => ({ days: [], hotels: [] }) },
    budget: { type: budgetSchema, default: () => ({ total: 0, breakdown: { accommodation: 0, food: 0, transport: 0, activities: 0 }, withinBudget: true }) },
    review: { type: reviewSchema, default: {} },
    buildTrace: { type: buildTraceSchema },
  },
  {
    timestamps: true,
  }
);

export const Trip = mongoose.model<ITrip>('Trip', tripSchema);
