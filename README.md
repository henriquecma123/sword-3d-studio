# Sword 3D Studio

Product shots of Sword devices from any angle, in the browser, grouped by health area:

- Musculoskeletal Health: Thrive Pad, Vision AI phone, box, resistance bands, yoga block
- Women's Health: Sword pod, box
- Cardiometabolic Health: M-Band, smart scale, blood pressure monitor, glucometer, resistance bands, box

Set the camera, light and floor (Space-drag, right-drag or ⇧-drag pans the view), then export PNGs. Combine shows several devices in one shot: press Combine, then tick them on their cards (or ⇧-click a card); Uncombine goes back to one. Drag each to place it, scroll to turn it, ⌥-drag to raise it; Turn, Tilt, Roll and Height set it exactly, so devices can float together. Devices on the floor rest on it or on each other; the bands are simulated and keep clear of the devices.

Live: https://sword.3d-studio.workers.dev/

## Run locally

It's a static site with no build step. Serve the folder with any static server, for example:

```bash
npx serve .
```

Then open the address it prints. It uses [three.js](https://threejs.org/), which is included in `vendor/`.
