# HYPERBOLE Studio

Web-based generator suite for motion graphics loops.
Two generators built-in:

1. **Wireframe Forward** — endless tunnel with wave distortion + speed pulse
2. **Glitch Morph** — text A → B ping-pong with progressive glitch transition

## Features

- Real-time preview with parameter sliders
- Aspect ratio selector (1:1 / 4:3 / 4:5 / 16:9)
- Accent color customization
- PNG sequence export with custom resolution/FPS/duration → ZIP download

## Run locally

Just open `index.html` in a browser. No build step required.

```sh
# or via simple http server (recommended for some browsers)
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub/GitLab repo
2. Connect to Cloudflare Pages → "Create a project"
3. Build settings:
   - Build command: *(leave blank)*
   - Build output directory: `/`
4. Deploy

The `_headers` file configures security headers and caching.

## Adding a new generator

Create a file in `js/generators/` exposing `window.HYPERBOLE_GENERATORS.<id>`
with this shape:

```js
window.HYPERBOLE_GENERATORS.myGen = {
  id: 'myGen',
  name: 'My Generator',
  defaultParams: { /* ... */ },
  paramSchema: [ /* see existing generators for format */ ],
  setup(state) { /* optional reset */ },
  render(ctx, w, h, t, params, opts) { /* draw one frame */ },
  suggestLoopDuration(params) { return 4.0; }
};
```

Then add `<script src="js/generators/myGen.js"></script>` to `index.html` and
add an `<option value="myGen">` to the generator dropdown.

## License

© HYPERBOLE™ 2026
