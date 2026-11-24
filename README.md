# Sword 3D Studio

Product shots of Sword devices from any angle, in the browser, grouped by health area:

- Musculoskeletal Health: Thrive Pad, Vision AI phone, box, resistance bands, yoga block
- Women's Health: Sword pod, box
- Cardiometabolic Health: M-Band, smart scale, blood pressure monitor, glucometer, resistance bands, box

Set the camera, light and floor, then export PNGs. Combine shows several devices in one shot: tick them on their cards (or ⇧-click a card), or use "Combine all" for a whole health area's kit. Drag each to place it and scroll to turn it. They rest on the floor or on each other, and the bands drape over the others.

Live: https://sword.3d-studio.workers.dev/

## Run locally

It's a static site with no build step. Serve the folder with any static server, for example:

```bash
npx serve .
```

Then open the address it prints. It uses [three.js](https://threejs.org/), which is included in `vendor/`.
