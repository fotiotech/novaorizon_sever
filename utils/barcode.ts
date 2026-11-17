function computeEANCheckDigit(code: string): string {
  const digits = code.split("").map(Number);
  let sum = 0;
  for (let i = digits.length - 1, j = 0; i >= 0; i--, j++) {
    const multiplier = j % 2 === 0 ? 3 : 1;
    sum += digits[i] * multiplier;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

export function isValidBarcode(code: string, type?: string): boolean {
  const cleaned = code.replace(/\D/g, "");
  if (!cleaned) return false;

  const normalizedType = type?.trim().toUpperCase();
  if (normalizedType === "MODEL") return cleaned.length > 0;

  let validLength = false;
  let effectiveType = normalizedType;

  switch (normalizedType) {
    case "EAN-13":
    case "ISBN-13":
      validLength = cleaned.length === 13;
      break;
    case "UPC-A":
      validLength = cleaned.length === 12;
      break;
    case "EAN-8":
      validLength = cleaned.length === 8;
      break;
    default:
      if (cleaned.length === 13) effectiveType = "EAN-13";
      else if (cleaned.length === 12) effectiveType = "UPC-A";
      else if (cleaned.length === 8) effectiveType = "EAN-8";
      else return false;
      validLength = true;
  }

  if (!validLength) return false;

  if (
    effectiveType === "ISBN-13" &&
    !cleaned.startsWith("978") &&
    !cleaned.startsWith("979")
  ) {
    return false;
  }

  const body = cleaned.slice(0, -1);
  const givenCheck = cleaned.slice(-1);
  return givenCheck === computeEANCheckDigit(body);
}
