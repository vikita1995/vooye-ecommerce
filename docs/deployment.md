# Deployment

The target production platform is GCP Cloud Run.

## Planned Pipeline

```txt
GitHub
  -> build
  -> test
  -> security checks
  -> container build
  -> Artifact Registry
  -> Cloud Run
```

No GCP credentials, Supabase keys, database passwords, or payment secrets should be committed to the repository.

## Future Infrastructure Work

- Add Dockerfile for the Next.js app.
- Add Cloud Run service configuration.
- Add GitHub Actions workflow.
- Add Artifact Registry image publishing.
- Bind production secrets from GCP Secret Manager.
- Configure Cloud Run runtime environment variables.
