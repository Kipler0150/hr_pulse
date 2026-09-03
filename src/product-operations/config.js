const LOCAL_CURSOR_SECRET = "hr-pulse-product-operations-local-cursor-secret-32";

export function isProductOperationsEnabled() {
  return process.env.HR_PULSE_PRODUCT_OPERATIONS_ENABLED === "true";
}

export function getProductOperationsCursorSecret() {
  const value = process.env.HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET;
  if (value && Buffer.byteLength(value, "utf8") >= 32) return value;
  if (process.env.NODE_ENV === "production") throw new Error("HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET is required");
  return value || LOCAL_CURSOR_SECRET;
}

export function assertProductOperationsEnabled() {
  if (!isProductOperationsEnabled()) {
    const error = new Error("Product operations are disabled");
    error.code = "PRODUCT_OPERATIONS_DISABLED";
    throw error;
  }
}
