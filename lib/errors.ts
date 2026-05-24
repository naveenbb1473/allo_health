export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class OutOfStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutOfStockError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ExpiredReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpiredReservationError";
  }
}

export class InvalidReservationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReservationStateError";
  }
}
