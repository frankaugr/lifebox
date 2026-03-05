# BoxLife MVP (GitHub Pages)

A static web MVP for visualizing life in weeks.

## What it does
- Takes user input for:
  - current age
  - average daily screen time
  - life expectancy (default 80 years)
- Renders one box per week of life expectancy.
- Colors boxes as:
  - grey: weeks already lived
  - black: projected future sleep time (age-based sleep model)
  - blue: projected future phone time (from screen-time input)
  - light: other future time

## Run locally
Because this is a static site, you can open `index.html` directly in a browser.

Optional local server:
```bash
python3 -m http.server 8080
```
Then open <http://localhost:8080>.

## Deploy to GitHub Pages
1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings` -> `Pages`.
3. Under `Build and deployment`, set:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main` (or your default branch), `/ (root)`
4. Save and wait for the Pages URL to be published.

If this repo is named `BoxLife`, your URL is typically:
- `https://<your-username>.github.io/BoxLife/`
