export const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(paise / 100);
export const parseShippingFee = () => { const n = Number(process.env.SHIPPING_FLAT_FEE_PAISE ?? "0"); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };
