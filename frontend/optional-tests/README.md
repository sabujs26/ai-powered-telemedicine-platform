# Optional UI tests (not part of the build or CI)

Run once to try them (installs test-only packages; the app does not need them):

```powershell
cd frontend
npm install --save-dev vitest@2 jsdom @testing-library/react@16 @testing-library/user-event @testing-library/jest-dom
npx vitest run --config optional-tests/vitest.config.js
```
