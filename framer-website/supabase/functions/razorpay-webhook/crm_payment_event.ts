type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function hasPaymentRequestNote(entity: unknown): boolean {
  const notes = asRecord(asRecord(entity)?.notes);
  return typeof notes?.payment_request_id === "string" &&
    notes.payment_request_id.trim().length > 0;
}

export function isCrmFinancePaymentEvent(event: unknown): boolean {
  const payload = asRecord(asRecord(event)?.payload);
  const payment = asRecord(asRecord(payload?.payment)?.entity);
  const order = asRecord(asRecord(payload?.order)?.entity);
  const paymentLink = asRecord(asRecord(payload?.payment_link)?.entity);

  return hasPaymentRequestNote(payment) || hasPaymentRequestNote(order) ||
    hasPaymentRequestNote(paymentLink);
}
