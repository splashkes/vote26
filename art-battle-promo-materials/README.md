# Art Battle Promo Materials Generator

A React SPA for generating and downloading promotional materials for Art Battle events. Artists can browse and download ready-made promo assets, while designers can upload and manage templates.

## Features

### For Artists (Anonymous Access)
- Browse events at `/` 
- View promotional materials at `/e/:eventId` (e.g., `/e/AB3333`)
- Download PNG and MP4 promotional materials at 50% preview scale
- No authentication required

### For Designers (Super Admin Access)
- Template management at `/designer`
- Upload and publish templates
- JSON-based template specification system
- Preview functionality

## Architecture

- **Frontend**: React 18 + Vite + Radix UI Themes
- **Backend**: Supabase (shared with other Art Battle apps)
- **Rendering**: Client-side HTML/CSS with html-to-image
- **Export**: PNG (immediate), MP4 (basic animation)
- **Storage**: DigitalOcean Spaces via s3cmd

## Template System

Templates use a JSON specification format:

```json
{
  "$schema": "https://artbattle.app/template.v1.json",
  "name": "Template Name",
  "kind": "perArtist" | "eventWide",
  "variants": [
    { "id": "square", "w": 1080, "h": 1080, "pixelRatio": 2 }
  ],
  "assets": {
    "frame": "url",
    "logo": "url", 
    "fonts": []
  },
  "layers": {
    "underlay": { "source": "artist.sample_asset_url", "fit": "cover" },
    "textHtml": "<div>{event.title}</div>",
    "frame": "${assets.frame}"
  },
  "css": "/* styles */",
  "animation": { "intro": [], "loop": [] }
}
```

## Database Tables

- `tmpl_templates` - Template specifications
- `tmpl_assets` - Binary assets (frames, logos, etc.)
- `tmpl_outputs` - Generated output tracking

## Development

```bash
npm install
npm run dev    # Development server on port 3003
npm run build  # Production build
```

## Deployment

```bash
./deploy.sh
```

Deploys to: `https://artb.tor1.cdn.digitaloceanspaces.com/promo/`

## Access Patterns

- **Public Gallery**: `https://artb.art/promo/AB3333` (replace AB3333 with event EID)
- **Designer Studio**: `https://artb.art/promo/designer` (requires super admin auth)

## Configuration

- **Base URL**: `/promo/` (configured in vite.config.js)
- **Port**: 3003 (development)
- **Storage Key**: `artbattle-promo-auth` (separate from admin app)

## Future Enhancements

- Full MP4 export with ffmpeg.wasm
- Server-side rendering with Remotion/Puppeteer
- Batch export functionality
- Asset upload interface
- Advanced animation system
