export function mapServiceErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (
    value.includes("services_average_service_minutes_positive") ||
    (value.includes("average_service_minutes") && value.includes("check"))
  ) {
    return "Average duration must be a positive whole number of minutes.";
  }

  if (value.includes("services_name_not_blank")) {
    return "Service name cannot be empty.";
  }

  if (
    value.includes("foreign key") ||
    value.includes("violates foreign key") ||
    value.includes("queues_service_id_fkey") ||
    value.includes("23503")
  ) {
    return "This service is used by one or more queues. Deactivate it instead of deleting.";
  }

  if (
    value.includes("row-level security") ||
    value.includes("42501") ||
    value.includes("permission denied")
  ) {
    return "You do not have permission to change services for this business.";
  }

  if (value.includes("jwt") || value.includes("authentication")) {
    return "Your session expired. Please log in again.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not update services. Please try again.";
}

export function mapQueueErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("queues_name_not_blank")) {
    return "Queue name cannot be empty.";
  }

  if (
    value.includes("must match service") ||
    value.includes("queue business_id must match")
  ) {
    return "That service does not belong to your business.";
  }

  if (value.includes("service not found")) {
    return "Select a valid service for this queue.";
  }

  if (value.includes("service is inactive")) {
    return "Choose an active service. Inactive services cannot be used for new queues.";
  }

  if (
    value.includes("invalid input value for enum queue_status") ||
    value.includes("queue_status")
  ) {
    return "Choose a valid queue status.";
  }

  if (
    value.includes("row-level security") ||
    value.includes("42501") ||
    value.includes("permission denied")
  ) {
    return "You do not have permission to change queues for this business.";
  }

  if (value.includes("jwt") || value.includes("authentication")) {
    return "Your session expired. Please log in again.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not update queues. Please try again.";
}

export function mapJoinQueueErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("customer name is required")) {
    return "Your name is required.";
  }

  if (value.includes("customer name is too long")) {
    return "Your name is too long.";
  }

  if (value.includes("customer phone is too long")) {
    return "Your phone number is too long.";
  }

  if (value.includes("queue not found") || value.includes("no_data_found")) {
    return "This queue could not be found.";
  }

  if (value.includes("not open") || value.includes("paused") || value.includes("closed")) {
    return "This queue is not accepting customers right now.";
  }

  if (value.includes("service is inactive")) {
    return "This service is currently unavailable.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not join this queue. Please try again.";
}

export function mapTicketErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (
    value.includes("invalid ticket credentials") ||
    value.includes("ticket not found") ||
    value.includes("no_data_found")
  ) {
    return "This ticket could not be found. Check that you opened it on this device.";
  }

  if (value.includes("only waiting tickets can be cancelled")) {
    return "Only waiting tickets can be cancelled.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not update your ticket. Please try again.";
}

export function mapQueueEntryErrorMessage(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("no waiting")) {
    return "There are no waiting customers.";
  }

  if (value.includes("queue is not open")) {
    return "Open the queue before calling the next customer.";
  }

  if (value.includes("queue not found") || value.includes("queue entry not found")) {
    return "That queue entry could not be found.";
  }

  if (
    value.includes("not a member") ||
    value.includes("insufficient_privilege") ||
    value.includes("authentication required")
  ) {
    return "You do not have permission to manage this queue.";
  }

  if (value.includes("invalid transition")) {
    return "That status change is not allowed for this customer.";
  }

  if (value.includes("already in status")) {
    return "This customer is already in that status.";
  }

  if (value.includes("network") || value.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not update this customer. Please try again.";
}
