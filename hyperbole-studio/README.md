# HYPERBOLE Studio

Web-based generator suite for motion graphics loops and image processing.

## Generators

1. **Wireframe Forward** — endless tunnel with wave distortion + speed pulse
2. **Glitch Morph** — text A → B ping-pong with progressive glitch transition
3. **Image Dither** — 6 dither algorithms applied to uploaded images
   - Modulated Diffuse Y, Floyd-Steinberg, Atkinson, Bayer, Halftone, ASCII

## Features

- Real-time preview with parameter sliders
- Aspect ratio selector (1:1 / 4:3 / 4:5 / 16:9)
- Accent color customization
- **PNG sequence export** (animated loops as ZIP)
- **Still PNG export** (single frame, for image-based generators)

## Run locally

```sh
cd hyperbole-studio
python3 -m http.server 8000
# → http://localhost:8000
```

## Deploy to Cloudflare Pages (Git connection)

This is a pure static site. No build step, no `wrangler.toml` needed.

1. Push this folder to a GitHub or GitLab repo:

   ```sh
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/hyperbole-studio.git
   git push -u origin main
   ```

2. Go to [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**
3. Choose **Pages** → **Connect to Git** → select your repo
4. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `/`
5. Click **Save and Deploy**

The `_headers` file configures security headers and caching automatically.

After the first deploy, every `git push` triggers a new deployment.

## Adding a new generator

Create a file in `js/generators/` exposing `window.HYPERBOLE_GENERATORS.<id>`:

```js
window.HYPERBOLE_GENERATORS.myGen = {
  id: 'myGen',
  name: 'My Generator',
  requiresImage: false,        // true if needs image upload
  defaultParams: { /* ... */ },
  paramSchema: [ /* see existing generators */ ],
  setup(state) { /* optional reset */ },
  render(ctx, w, h, t, params, opts) { /* draw one frame */ },
  suggestLoopDuration(params) { return 4.0; }
};
```

Then in `index.html`:
- Add `<script src="js/generators/myGen.js"></script>`
- Add `<option value="myGen">My Generator</option>` to the generator select

## License

© HYPERBOLE™ 2026
