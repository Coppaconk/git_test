# ShotDeck False Color (Brave / Chrome extension)

Toggles a cinema-style false color exposure overlay on images on shotdeck.com.

## Install (Brave)
1. Go to `brave://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this `shotdeck-false-color` folder.
3. Pin the extension. Then click its icon to turn it on, or press **Alt+Shift+F**.

## Scales
- **ARRI-style (classic):** purple = black clip, blue = just above black, green = 18% grey (38–42%),
  pink = +1 stop / skin (52–56%), yellow = near clip, red = clipped. Everything else stays greyscale.
- **Full spectrum:** every luma range gets a colour.
- **Clipping only:** shows only crushed blacks and clipped whites.

Levels are Rec.709 luma of the image's encoded sRGB values (0–100%, like IRE). ShotDeck stills are
graded, compressed images, so read this as "where does the picture's tonality sit", not as a camera's
real exposure.

## How it works
It uses an SVG colour filter (luma → lookup table) applied with CSS, so it never reads pixels and works
on images served from ShotDeck's image servers. To use it on other sites, add them to `matches` in
`manifest.json` (or use `"<all_urls>"`) and reload the extension.
