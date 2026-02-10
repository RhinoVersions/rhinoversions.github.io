# Rhino Versions

A professional, automatically-updated dashboard for the latest Rhino 3D build downloads and version history.

🌐 **Live Site**: [rhinoversions.github.io](https://rhinoversions.github.io)

## How It Works

This repository uses **GitHub Actions** to automatically aggregate data from **NuGet RhinoCommon** packages daily. It validates download URLs and updates the static frontend hosted on **GitHub Pages**.

## Key Features

- **Daily Updates**: Build data reflects the latest NuGet releases.
- **Direct Downloads**: Immediate access to Windows and Mac installer builds.
- **Version History**: Comprehensive searchable history for Rhino 7 and 8.
- **Clean UI**: Minimalist, list-based dashboard inspired by official Rhino tooling.
- **Responsive**: Full mobile and touch-target support.

## Local Development

```bash
# Clone
git clone https://github.com/rhinoversions/rhinoversions.github.io.git
cd rhinoversions.github.io

# Run
python3 -m http.server 8000
```

## Structure

- `.github/workflows/`: Automation logic for NuGet tracking.
- `fetch_versions.py`: Core logic for scraping and markdown generation.
- `rhino-versions-all.md`: Auto-generated database of all versions.
- `index.html` / `styles.css` / `script.js`: Vanilla frontend components.

## License

MIT License.

