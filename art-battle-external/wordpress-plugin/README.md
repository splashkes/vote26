# Art Battle Artists Display WordPress Plugin

A WordPress plugin that displays confirmed artists for Art Battle events using data from the Supabase edge function.

## Features

- **Shortcode Support**: Simple `[art-battle-artists event="AB3333"]` shortcode
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Caching**: 3-hour caching for optimal performance
- **Multiple Layouts**: Grid and list view options
- **Rich Content**: Artist bios, photos, social links, and event information
- **Admin Settings**: Configure API endpoint and cache settings
- **Error Handling**: Graceful fallbacks for API issues

## Installation

1. Upload the `art-battle-artists-display` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Use the shortcode in posts, pages, or widgets

## Usage

### Basic Usage
```
[art-battle-artists event="AB3333"]
```

### Advanced Usage
```
[art-battle-artists event="AB3053" layout="list" show_images="yes" show_bios="yes" show_social="yes"]
```

### Shortcode Parameters

| Parameter | Default | Options | Description |
|-----------|---------|---------|-------------|
| `event` | (required) | Event ID like AB3333 | The Art Battle event identifier |
| `layout` | `grid` | `grid`, `list` | Display layout style |
| `show_images` | `yes` | `yes`, `no` | Show artist promo images |
| `show_bios` | `yes` | `yes`, `no` | Show artist biographies |
| `show_social` | `yes` | `yes`, `no` | Show social media links |

## Examples

### Display artists in grid layout (default)
```
[art-battle-artists event="AB2900"]
```

### Display artists in list layout without images
```
[art-battle-artists event="AB3053" layout="list" show_images="no"]
```

### Display only names and social links
```
[art-battle-artists event="AB3026" show_bios="no" show_images="no"]
```

## Admin Settings

Go to **Settings > Art Battle Artists** to configure:

- **API Base URL**: Supabase edge function endpoint
- **Cache Duration**: How long to cache API responses (3 hours default)
- **Clear Cache**: Manually clear all cached artist data

## API Integration

This plugin connects to the Art Battle Supabase edge function:
- **Endpoint**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/wp-artists-export`
- **Method**: GET
- **Parameters**: `?event=AB3333`
- **Caching**: 3 hours (configurable)

## Data Structure

The plugin displays the following artist information:
- Name
- Location (city)
- Biography (abhq_bio or bio field)
- Promo image (if available)
- Social media links (Instagram, Facebook, website)
- Sample works count

## Styling

The plugin includes responsive CSS with these main classes:
- `.ab-artists-container` - Main wrapper
- `.ab-artists-grid` - Grid layout container  
- `.ab-artists-list` - List layout container
- `.ab-artist-card` - Individual artist card
- `.ab-artist-image` - Artist photo container
- `.ab-artist-content` - Artist text content
- `.ab-artist-name` - Artist name heading
- `.ab-artist-bio` - Biography text
- `.ab-artist-social` - Social media links

## Error Handling

The plugin gracefully handles:
- Missing event ID parameter
- API connection failures
- Invalid event IDs
- Empty artist lists
- Missing artist data

Error messages are displayed to users with helpful context.

## Caching

- **Duration**: 3 hours by default (10800 seconds)
- **Key Format**: `ab_artists_{event_id}`
- **Storage**: WordPress transients
- **Manual Clear**: Available in admin settings

## Requirements

- WordPress 5.0+
- PHP 7.4+
- Internet connection for API calls
- Active Art Battle event with confirmed artists

## Changelog

### 1.1.0
- **ABHQ Priority**: Now prioritizes `abhq_bio` over regular bio content
- **ABHQ Promo Images**: Prioritizes ABHQ promo images over sample works
- **Modal Image Viewer**: Click thumbnails to open full-size images in modal
- **Fixed Image Variants**: Uses valid Cloudflare variants (thumbnail, public, original)
- **Enhanced UX**: Hover effects, smooth transitions, responsive modal
- **Interactive Features**: ESC key, click outside, and X button to close modal

### 1.0.0
- Initial release
- Shortcode support
- Grid and list layouts
- Caching system
- Admin settings page
- Responsive design
- Error handling

## Support

For issues or feature requests related to the WordPress plugin, contact the Art Battle development team.

For API issues or missing artist data, check the Supabase edge function logs.