# Apply these initial Vooye repository improvements

1. Extract this archive into the root of your local `vooye-ecommerce` clone, preserving the included directory structure. Review before replacing `README.md` and `docs/architecture.md`.
2. The archive adds `.github/workflows/validate.yml`. It does not replace the existing deployment workflow.
3. Review the changes:
   ```bash
   git diff -- README.md docs/architecture.md
   git status --short
   ```
4. Run the application checks:
   ```bash
   cd vooye-marketplace
   npm ci
   npm run typecheck
   npm run lint
   npm run build
   cd ..
   ```
5. Commit these changes on a feature branch and open a pull request. Do not merge until the workflow passes.

Scope note: this first batch improves documentation consistency and pull-request validation. It does not implement database persistence, protected admin APIs, payment processing, or other production commerce features. Those require separate changes and testing. GitHub write access was rejected, so these files have not been pushed to GitHub.
