class AppError extends Error {
  constructor(message, statusCode){
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true; // distinguishes "expected" errors from real bugs
  }
}

class ValidationError extends AppError {
  constructor(message, details){
    super(message, 400);
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found'){
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict'){
    super(message, 409);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden'){
    super(message, 403);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Not authenticated'){
    super(message, 401);
  }
}

module.exports = { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError, UnauthorizedError };
