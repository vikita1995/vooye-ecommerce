export const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(paise / 100);
export const parseShippingFee = () => {
  const raw = process.env.SHIPPING_FLAT_FEE_PAISE;
  if (raw === undefined || raw.trim() === "") throw new Error("SHIPPING_NOT_CONFIGURED");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("SHIPPING_NOT_CONFIGURED");
  return n;
};
