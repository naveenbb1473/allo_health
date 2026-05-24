import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError } from "@/lib/hooks/useApi";
import { AlertCircle, AlertTriangle } from "lucide-react";

interface ErrorDisplayProps {
  error: ApiError | Error | null;
  onRetry?: () => void;
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  if (!error) return null;

  const isApiError = error instanceof ApiError;

  if (isApiError && error.code === 409) {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Out of Stock</AlertTitle>
        <AlertDescription>
          {error.message}{" "}
          {error.available !== undefined &&
            `(only ${error.available} available)`}
        </AlertDescription>
      </Alert>
    );
  }

  if (isApiError && error.code === 410) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Reservation Expired</AlertTitle>
        <AlertDescription>
          Your reservation expired. The items have been returned to inventory.
        </AlertDescription>
      </Alert>
    );
  }

  // Fallback for generic errors (500, 404, etc)
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error {isApiError ? error.code : ""}</AlertTitle>
      <AlertDescription>
        {error.message || "Something went wrong."}
      </AlertDescription>
    </Alert>
  );
}
