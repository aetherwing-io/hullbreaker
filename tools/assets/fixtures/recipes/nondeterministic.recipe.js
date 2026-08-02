// nondeterministic.recipe.js — the negative control for render.mjs's
// determinism proof. NOT AN ASSET: nothing in the manifest points at it, and
// running it is supposed to fail.
//
//   node tools/assets/render.mjs tools/assets/fixtures/recipes/nondeterministic.recipe.js
//   -> render failed: the same recipe rendered two different images in one run
//
// It exists because the recipe scan in lib/recipe.mjs is a lexer with a list of
// banned names, and a list of banned names is never complete. This recipe passes
// that scan cleanly — `crypto.getRandomValues` is not on the list, and could not
// be reached by any list that did not already know about it — and is caught one
// layer down, by rendering twice and comparing the bytes. That layering is the
// design: the scan catches what it can name and points at the line; the double
// render proves the property that actually matters.
//
// If this fixture ever renders successfully, the determinism proof has stopped
// working and every "reproducible: yes" line in the pipeline is worthless.

export const meta = {
  id: 'nondeterministic',
  size: { w: 32, h: 32 },
  seed: 1,
  roles: ['rust-orange'],
};

export function render(ctx, env) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);                    // not seeded, not from env
  const rust = env.hexToRgb(env.PALETTE['rust-orange']);
  env.field((x, y) => [rust.r, rust.g, (rust.b + bytes[0]) % 256, 255]);
}
