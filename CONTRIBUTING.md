# Contributing to FAULTLINE

Bug reports, balance feedback, accessibility improvements and pull requests are welcome.

## Set up

Use Node.js 24. Clone the repository, then run `npm ci` and `npm run dev`. The game opens at `http://localhost:5174`.

## Before a pull request

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

For changes to assets, URLs, the build, or deployment, also test the actual Pages path:

```sh
VITE_BASE_PATH=/faultline/ npm run build
VITE_BASE_PATH=/faultline/ FAULTLINE_TEST_BUILD=true npm run test:e2e
```

The browser suite launches a preview server on port 4174 for that production check. GitHub Actions runs the same checks before publishing `main` to Pages. Pull requests run checks without deploying.

## Working on the game

- Keep rule changes in `src/core/`; add deterministic tests for changed mechanics and save compatibility.
- Keep readable enemy intentions, card rules and actual damage in agreement.
- Desktop is the primary target. Check 1366×768 and 1920×1080, long hands, keyboard controls and reduced motion.
- Use the existing brass, worn ivory and indigo art direction. Preserve enough contrast to read cards during play.
- Include a screenshot or a short recording for visual changes. `node scripts/capture.mjs` captures a repeatable encounter while the dev server runs.
- Preserve third-party notices. Document new assets and their source/license. Generated art and music have their prompts and production metadata documented in the repository.
- Finished artwork, fonts and playable music are bundled. Do not add API keys or require a music model to play the game.

## Bug reports

Include your browser, screen size, expedition seed, architect and the steps to reproduce the issue. If useful, attach a screenshot. Saves live in your browser's local storage; they are not uploaded to a server.

## License

Contributions are submitted under the project's [MIT license](LICENSE), with existing third-party licensing retained.
