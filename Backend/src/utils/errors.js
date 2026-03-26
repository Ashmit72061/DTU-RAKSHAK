// src/utils/errors.js

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

export class CameraNotFoundError extends AppError {
  constructor(message) {
    super(message, 404);
  }
}

export class LowConfidenceError extends AppError {
  constructor(message) {
    super(message, 422); // Unprocessable Entity
  }
}

export class StateAnomalyError extends AppError {
  constructor(message) {
    super(message, 409); // Conflict
  }
}
