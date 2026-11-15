# Black cat

An interactive 3D model of black Scottish Fold cat, Chernushka, that runs in the browser.
Everything is built procedurally with [Three.js](https://threejs.org/): no external models, no build step.

The body is one seamless skinned mesh with realistic cat proportions: it is sculpted from smoothly
blended muscles and fat pads as a signed distance field when the page loads and bound to a cat
skeleton (a flexible spine, gliding shoulder blades, four legs, a two-joint neck and a long tail).

**Live demo:** https://victornagibator.github.io/black-cat-model/

![Chernushka](docs/preview.jpg)

## Features

- **Poses:** stand, sit, loaf, sphinx, lie on side, sleep curled up, belly up.
- **Actions:** sniff a sock (with a flehmen face), yawn, meow, blep, wash, stretch.
- **Interactions:** pet her (hold and drag on the head or back, she purrs), boop the nose, rub the belly when she lies belly up, don't touch the tail.
- **Games:** laser pointer (she stalks and pounces) and a toy mouse.
- **Natural motion:** paws stay planted while she sits down, turns or stretches; every move between
  poses is choreographed the way a cat does it (the haunches go down first when she sits, the front
  paws walk forward when she lies down, she flops onto her side hips first); the shoulder blades roll
  when she walks, the spine bends into turns, and the tail swings after the body and drapes on the rug.
- Follows the cursor with her eyes, blinks, breathes and lives her own life when idle: looks around,
  licks her lips, sniffs the air, twitches an ear.
- English / Russian UI.

## Run locally

Requires [Node.js](https://nodejs.org/) (no dependencies to install):

```bash
npm start
```

Then open http://localhost:5188. Any other static file server works too.


## Project structure

| File | Contents |
| --- | --- |
| `src/cat.js` | the model: skeleton, skinned body, head, eyes, mouth, ears, whiskers, collar, shell fur |
| `src/sdf.js` | signed distance modelling and surface extraction (surface nets) |
| `src/poses.js` | pose library and the choreography of moves between poses |
| `src/legs.js` | leg IK, paw planting and the walk cycle |
| `src/main.js` | scene, behaviour, actions, input, UI |
| `src/props.js` | the sock |
| `src/i18n.js` | UI strings (English / Russian) |
| `src/audio.js` | synthesized meow, purr, boop and hiss |
| `serve.js` | tiny zero-dependency dev server |
