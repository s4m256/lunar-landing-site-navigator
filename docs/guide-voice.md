# Guide and voice status

> Historical guided experience. The active entry point is now the [minimal comparison explorer](minimal-comparison.md).
The selected guide remains the existing Astronaut image by Poly (CC BY 2.0). [Asset credits](assets/astronaut.md) are also available in About. The first English line explains that Lua is fictional and CLPS missions carry no astronauts.

Voice is temporarily removed from the active application. Neither `GameDialogue` nor the legacy `MissionDialogue` mounts `SpeechControl`. The speech implementation remains in source for a later, explicit accessibility decision; the active app does not access the Web Speech API.

The current interaction is text only: Back revisits a line; Continue completes a typing line, then advances on the next click. Reduced motion presents the full text immediately. Screen readers receive one complete accessible copy. See the [script and navigation](mission-dialogue.md).

Generate the standalone preview:

```sh
node scripts/build-guide-preview.mjs /tmp/lunar-delivery
python -m http.server 4188 --bind 127.0.0.1 --directory /tmp/lunar-delivery
```

Open `http://127.0.0.1:4188/Lunar-English.html`. Previous filenames remain aliases of the same application.

After installing Playwright and Axe as documented in [guided-mission.md](guided-mission.md), run:

```sh
cp scripts/guide-browser-review.mjs /tmp/lunar-review-browser/guide-browser-review.mjs
REVIEW_URL=http://127.0.0.1:4188/Lunar-English.html OFFLINE_REVIEW=1 node /tmp/lunar-review-browser/guide-browser-review.mjs
```

The runner checks English text, two controls, reveal/advance, backward navigation, keyboard focus, mobile sizing, selected Axe rules, and zero speech API access. It does not test audible output because voice is not part of this version.
