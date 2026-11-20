# False Color (Brave / Chrome extension)

Cinema-style exposure tools for images on any website, built with ShotDeck in mind.

## Install (Brave)
1. Go to `brave://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this `shotdeck-false-color` folder.
   (Updating? Click the reload arrow on the extension's card, then reload open tabs.)
3. Pin the extension, open a site, click the icon and tick **On for this site**.

## Features
| Feature | How to use |
|---|---|
| **Per-site on/off** | Popup: "On for this site", or **Alt+Shift+F**. "On for all sites by default" turns it on everywhere you haven't switched it off. |
| **Tools** | False color, Zebras, Luma (greyscale), Focus peaking. Switch in the popup or with **Alt+Shift+M**. |
| **False color scales** | ARRI-style, Full spectrum, Clipping only, or your own **Custom** scale. |
| **Custom scale editor** | Popup → *Settings & custom scale…*. Copy a preset, edit bands/colours/labels, save. |
| **Zebras** | Striped over everything above a level you set (default 95%). |
| **Focus peaking** | Red highlights on sharp edges, over a dimmed greyscale image. Low/Medium/High sensitivity. |
| **Hold to compare** | Hold **`** (backtick) on the page to see the original. Change the key in Settings. |
| **Split view** | Effect on the left of the mouse, original on the right, on the image you're hovering. |
| **Pick single images** | Set "Apply to" → *Alt+clicked images*, then Alt+click images to toggle them. "Clear picks" resets. |
| **Hover readout** | Shows the luma % under the cursor, which band it's in, and ≈ stops vs 18% grey. |
| **Scopes** | Histogram or waveform of the image under the cursor, top-right of the page. |
| **Ignore small images** | Skips icons/avatars smaller than 64 px (change in Settings). |
| **Legend** | On-page key for the current tool, with hints. Can be hidden. |

## Notes
- Levels are Rec.709 luma of the image's encoded sRGB values (0–100%, like IRE). ShotDeck stills are
  graded, compressed images, so this shows where the picture's tones sit, not the camera's real exposure.
  The "stops vs 18% grey" figure assumes an sRGB image and is only a rough guide.
- The visual tools use SVG/CSS filters, so they never need to read pixels and work on any image.
- Readout and scopes do need pixels. For images on other domains the extension downloads its own copy
  of the image (that's why it asks for access to all sites). Video and canvas readouts only work when
  the site allows it.
- Browser pages (`brave://…`) and the extension store can't be changed by any extension.
