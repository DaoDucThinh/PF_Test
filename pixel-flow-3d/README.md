# Pixel Flow 3D

A Three.js recreation of the action-puzzle game **Pixel Flow**: tap pigs onto a looping conveyor; each pig auto-fires at cubes of its own color facing the belt (outer cubes shield inner ones). Empty pigs leave, pigs with ammo left hop into 5 waiting slots — fill them all and it's game over.

Play (after merge, via GitHub Pages): https://daoducthinh.github.io/PF_Test/pixel-flow-3d/dist/

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build to dist/
```

## Highlights

- 12 hand-made / procedural pixel-art levels (plus endless harder loops), generated outside-in so every board is solvable
- Edge-scanning targeting, conveyor capacity, lane queues, waiting slots, extra-slot continue
- Procedural cute pig shooters, instanced rounded cubes, animated conveyor belt
- Debris, glowing sparks, confetti, image reveal, squash & stretch, screen shake, combos
- Procedural Web Audio SFX + music (no asset files), bloom post-processing, soft shadows
- Progress, stars and settings saved in localStorage
