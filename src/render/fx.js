/* ============================== FX ================================ */
/* Juice pass: trauma shake, hit-stop, muzzle lights, particles,
   tracers, squash-and-stretch. Intentionally empty in grey-box. */

/* ============================= AUDIO ============================== */
/* Audio pass: WebAudio-synthesized SFX + generative bass loop.
   Intentionally empty in grey-box. */
/* Both passes get this module as their landing site; nothing imports it
   yet, so the grey-box build stays exactly as quiet as before. */

export {};
