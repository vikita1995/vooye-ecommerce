# Firebase Authentication migration

This branch moves the sign-in UI and server verification to Firebase Authentication while retaining Supabase/PostgreSQL as the data store.

## Required web environment variables

Set these on the Next.js/Cloud Run service (values come from Firebase Console → Project settings → Your apps → Web app):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- Optional: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- Optional: `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

Set `FIREBASE_PROJECT_ID` to the same Firebase project ID on the server. Do not commit private service-account keys.

## Server credentials

The Firebase Admin SDK uses Application Default Credentials. Prefer the Cloud Run service account over a downloaded JSON key. Grant that service account the minimum Firebase Authentication permissions required to verify ID tokens and create session cookies. Confirm IAM permissions in Google Cloud before deploying.

## Firebase Console

1. Enable Google, Phone, and Email/Password under Authentication → Sign-in method.
2. Add `vooye.in` to Authentication → Settings → Authorized domains.
3. Configure the Google OAuth consent screen and provider details for the same Firebase project.
4. For phone authentication, configure SMS/region policies and test with Firebase's test phone numbers before production SMS use.

## Validation before production

- Test Google popup sign-in and session cookie creation.
- Test phone OTP including reCAPTCHA on `https://vooye.in`.
- Test email/password sign-in, sign-up, and password reset.
- Verify protected pages redirect when signed out and allow access after sign-in.
- Test customer, seller, and admin APIs using Firebase ID tokens.
- Verify existing Firebase UIDs still map to the right rows in Supabase `customers.firebase_uid`.
- Confirm all browser API calls send Firebase ID tokens, not Supabase access tokens, before merging.
- Review admin authorization and all role-changing operations independently; page middleware is not a substitute for API authorization.

This migration does not migrate or delete database rows. Existing Supabase Auth accounts are not automatically converted to Firebase accounts; account linking and password migration must be planned separately for users who exist only in Supabase Auth.
