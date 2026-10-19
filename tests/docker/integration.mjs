// Compatibility entrypoint: smoke uses exactly the same deterministic verifier as the full suite.
process.argv.splice(2, 0, '--case', 'live-expression-syntax');
await import('./suite.mjs');
