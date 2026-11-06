# Side-mask validation, 2026-11-06

Run the actual application script against a native Canvas implementation:

```sh
npm install --no-save @napi-rs/canvas@0.1.100
node tests/mask.test.cjs mask-lab.html
```

This exercises real glyph rasterization and the application geometry/export. It uses a small DOM stub, so it does **not** test browser layout, touch interaction, browser-specific fonts, or actual downloads. No physical print or MAKSILED optical calibration has been performed.

## What changed after checking

The former wall view only displayed the requested text. It is now paired with ray tracing through the actual grid apertures, including the **whole segment through the mask thickness**. This catches blocked rays even when both face intersections lie in holes. The 3D view renders the full extrusion with a depth buffer; the old view had no thickness. Blanket material stripes have been removed; only detached letter counters receive bridges. Invalid input clears stale views and disables both exports. The default grid is 0.5 mm.

## Geometry

Wall is Z=0. LED point is S=(0,0,d). Upper mask inner face is Y=a=bodyHeight/2; thickness extends outward to a+t. Target wall point P=(X,Y,0), Y>a+t. Its intersection with the inner plane is Q=(a*X/Y,a,d*(1-a/Y)). The grid samples this inverse projection. Bottom masks use the negative Y side and reverse the vertical mapping of the target raster; text is not arbitrarily mirrored.

STL coordinates are (x, y, z) = (width coordinate, distance from wall, outward thickness). For an upper mask: world=(x-width/2,a+z,y). For a lower mask: world=(x-width/2,-a-z,y). The STL face z=0 faces the source. The side selection controls the required aperture shape.

## Results

Five actual glyph configurations passed binary STL checks for finite nondegenerate triangles, two faces per undirected edge, opposite edge winding, one connected material component, expected bounds and signed volume. Tested LIGHT, Cyrillic ОБА, bottom-side B8O, and non-integral grid spacing. Ray traversal, invalid inputs, mapping round trips and thickness presets also passed.

For LIGHT, width 180, body height 80, depth 45, source–wall 35, target 180×60 at offset 80, grid 0.5 mm:

| Thickness | Target letter area reached | Triangles | Components | Boundary/nonmanifold edges |
|---|---:|---:|---:|---:|
| 1.6 mm | 57.29% | 130056 | 1 | 0 / 0 |
| 0.8 mm | 71.74% | 130056 | 1 | 0 / 0 |

These percentages measure geometric coverage in the target rectangle, **not brightness, fidelity, or overall optical efficiency**. They exclude rays missing the target rectangle, the enclosure, lens refraction, source extent, scattering and material transmission. Font rasterization can vary by browser. A finer grid does not guarantee printable minimum walls. The sampled apertures still visibly distort text, so this is a diagnostic test coupon, not a finished lamp. Cylinder geometry and complete housing remain unimplemented.
