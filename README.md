# Rhino Versions

A modern, automatically-updated website displaying the latest Rhino versions from NuGet.

🌐 **Live Site**: [rhinoversions.github.io](https://rhinoversions.github.io)

## Features

- ✨ Modern, glassmorphic UI with smooth animations
- 🔄 Automatic weekly updates via GitHub Actions
- 📦 Data sourced directly from NuGet RhinoCommon packages
- 🔍 Searchable and filterable version history
- 📱 Fully responsive design
- 🌙 Beautiful dark mode aesthetic

## How It Works

This repository uses GitHub Actions to automatically:

1. Check NuGet for the latest RhinoCommon versions (weekly on Mondays)
2. Parse version information and build dates
3. Generate markdown files with download links
4. Update the GitHub Pages website

The workflow tracks Rhino versions 7 and 8, validating download URLs before publishing.

## Local Development

To test the website locally:

```bash
# Clone the repository
git clone https://github.com/rhinoversions/rhinoversions.github.io.git
cd rhinoversions.github.io

# Open in browser
 open index.html
 # or use a simple HTTP server
 python3 -m http.server 8000
```

Then navigate to `http://localhost:8000` in your browser.

## Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── update-rhino-versions.yml  # Auto-update workflow
├── index.html                     # Main website
├── styles.css                     # Modern CSS design system
├── script.js                      # Data fetching & UI logic
├── rhino-versions.md             # Latest version (auto-updated)
├── rhino-versions-all.md         # All versions (auto-updated)
└── README.md
```

## Configuration

The workflow can be customized via environment variables in `.github/workflows/update-rhino-versions.yml`:

- `RHINO_MAJORS`: Major versions to track (default: "7,8")
- `RHINO_LOCALE`: Download locale (default: "en-us")
- `HEAD_CHECK_LATEST`: Validate latest URL is live (default: "true")
- `HEAD_CHECK_ALL`: Validate all URLs are live (default: "true")

## GitHub Pages Setup

To enable GitHub Pages for this repository:

1. Go to **Settings** → **Pages**
 2. Under **Source**, select **GitHub Actions**
 3. Click **Save** (if applicable)

The site will be available at `https://rhinoversions.github.io` within a few minutes.

## Technology Stack

- **HTML5**: Semantic markup with proper SEO
- **CSS3**: Modern design with custom properties, glassmorphism, and animations
- **Vanilla JavaScript**: No dependencies, lightweight and fast
- **GitHub Actions**: Automated version tracking
- **GitHub Pages**: Free, reliable hosting

## Contributing

This project is automatically updated by GitHub Actions. To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this for your own projects!

## Credits

Built with ❤️ using modern web technologies. Version data sourced from the [RhinoCommon NuGet package](https://www.nuget.org/packages/RhinoCommon).
