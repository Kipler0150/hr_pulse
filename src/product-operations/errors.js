export const PRODUCT_OPERATIONS_ERROR_CATALOG = Object.freeze({
  PRODUCT_OPERATIONS_DISABLED: "Product operations are not available.",
  PRODUCT_OPERATIONS_FORBIDDEN: "This operations view is not available for the selected workspace.",
  AUDIT_FILTER_INVALID: "One or more audit filters are invalid.",
  AUDIT_CURSOR_INVALID: "This audit page link has expired or is invalid.",
  AUDIT_EVENT_NOT_FOUND: "That audit record is not available.",
  OPERATIONS_GROUP_UNAVAILABLE: "This operations group is temporarily unavailable.",
  OPERATION_UNAVAILABLE: "The operation could not be classified safely.",
});

export class ProductOperationsError extends Error {
  constructor(code, cause) {
    super(PRODUCT_OPERATIONS_ERROR_CATALOG[code] ?? PRODUCT_OPERATIONS_ERROR_CATALOG.OPERATIONS_GROUP_UNAVAILABLE);
    this.name = "ProductOperationsError";
    this.code = PRODUCT_OPERATIONS_ERROR_CATALOG[code] ? code : "OPERATIONS_GROUP_UNAVAILABLE";
    this.cause = cause;
  }
}

export function productOperationsIssue(error) {
  const safe = error instanceof ProductOperationsError ? error : new ProductOperationsError("OPERATIONS_GROUP_UNAVAILABLE");
  return { code: safe.code, message: safe.message };
}
