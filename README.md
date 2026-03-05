# BoxLife MVP (GitHub Pages)

A static web MVP for visualizing life in weeks.

## What it does
- Takes user input for:
  - current age
  - life expectancy (default 80 years)
  - average daily screen time
  - eating + meal prep hours/day
  - hygiene + bathroom hours/day
  - household chores/admin hours/day
  - commuting/transport hours/day
  - errands/shopping hours/day
- Renders one box per week of life expectancy.
- Separates the calendar into:
  - completed weeks
  - projected sleep weeks
  - projected non-screen activity weeks
  - remaining awake weeks (including screen time)
- Colors boxes as:
  - grey: weeks already lived
  - black: projected future sleep time (age-based sleep model)
  - blue: projected future phone time (from screen-time input)
  - orange: projected eating + meal prep
  - green: projected hygiene + bathroom
  - violet: projected chores/admin
  - pink: projected commuting/transport
  - amber: projected errands/shopping
  - light: other future time
- If the daily activity totals exceed awake time, the model proportionally reduces all awake
  categories and shows a notice.

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
