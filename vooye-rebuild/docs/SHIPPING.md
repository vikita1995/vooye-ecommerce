# Vooye shipping recommendation (fragile mirrors, India)

## Recommendation

Start by evaluating **Shiprocket as a multi-carrier aggregator**, not by committing to a single courier. It provides a rate calculator that uses pickup PIN, destination PIN, package weight and dimensions, and it compares available services. That is more appropriate for mirrors than picking a courier based on a headline price alone. Current references:

- Shiprocket rate calculator: https://www.shiprocket.in/shipping-rate-calculator/
- Shiprocket shipping overview and courier recommendation: https://www.shiprocket.in/shipping/
- Shiprocket FAQ on fragile items and rate factors: https://www.shiprocket.in/faq/
- Shiprocket shipment security information: https://www.shiprocket.in/insurance/

**Important:** These pages do not establish that every carrier available through Shiprocket will accept mirrors or cover breakage. Before using the service, get written confirmation from Shiprocket and the selected carrier that the specific glass mirror SKU, packaging, lane and declared value are accepted. Confirm whether protection covers breakage (not just loss/theft), what evidence is required, the claim deadline, exclusions and reimbursement form. The published insurance page lists eligible categories but does not clearly establish mirrors as eligible. Do not assume coverage.

Delhivery Direct is not recommended for Vooye mirrors without a written exception: its published terms list fragile items, including glass, mirrors and frames, as restricted items. See https://www.delhivery.com/direct/app/terms.

## Pilot plan

1. Use manual booking and tracking for the first small batch while validating packaging and damage rates.
2. Measure each fully packed mirror carton (length, width, height in cm) and weigh it. Courier billing can be based on volumetric or dead weight.
3. Ask Shiprocket to confirm mirror acceptance in writing and obtain rates for your pickup PIN and representative destination PINs. Compare surface/air service, delivery time, RTO charges, remote-area surcharges and damage cover.
4. Pack mirrors in a fitted rigid carton with edge/corner protection, cushioning on both faces, void fill and tamper-evident outer packaging. Perform a controlled packaging/shake check; keep photographs of the item and packed carton. Follow the chosen carrier's written requirements.
5. Set `SHIPPING_FLAT_FEE_PAISE` only after choosing your pricing policy (flat fee, free shipping threshold or zone-based subsidy). It is currently a temporary server-side flat fee, not a live carrier quote. Never guess a shipping fee.
6. Use the admin dashboard to save provider, tracking/AWB number and tracking URL. Save tracking details before changing order status to `SHIPPED`.
7. Before scaling, integrate the selected provider's API for live rate/serviceability checks, label creation, pickup scheduling, tracking webhooks and shipment reconciliation. The payment order must only be created after server-side shipping charges are finalized.

## Current application behavior

- Provider setting defaults to `manual`; no carrier API credentials are needed for the pilot.
- Checkout requires `SHIPPING_FLAT_FEE_PAISE` to be set. This is a fixed customer charge, so it may differ from the actual courier charge.
- Admin users can store shipping provider, tracking number and tracking URL. A tracking number is required before marking an order as shipped.
- Automated live quotes, labels, pickup booking, delivery webhooks, carrier-specific insurance selection and returns are not implemented yet.
