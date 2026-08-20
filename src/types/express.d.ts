import 'express';

declare module 'express' {
  interface Request {
    traceId?: string;
  }
}
