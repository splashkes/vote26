-- Add sample template data for testing
-- Migration: 20250910191000_add_sample_templates

-- Insert sample event-wide template
INSERT INTO tmpl_templates (name, kind, spec, published) VALUES (
  'Art Battle Hype - Event Wide',
  'eventWide',
  '{
    "$schema": "https://artbattle.app/template.v1.json",
    "name": "Art Battle Hype - Event Wide",
    "kind": "eventWide",
    "variants": [
      { "id": "square", "w": 1080, "h": 1080, "pixelRatio": 2 },
      { "id": "portrait", "w": 1080, "h": 1350, "pixelRatio": 2 }
    ],
    "assets": {
      "frame": "",
      "logo": "",
      "fonts": []
    },
    "layers": {
      "underlay": {
        "source": "event.bgFallback",
        "fit": "cover",
        "mask": false
      },
      "textHtml": "<div class=\"t-wrap\"><h1 class=\"title\">{event.title}</h1><p class=\"meta\">{event.city} • {event.date}</p><div class=\"venue\">{event.venue}</div></div>",
      "frame": "${assets.frame}",
      "logo": "${assets.logo}"
    },
    "css": ".t-wrap{position:absolute;inset:0;padding:48px;color:#fff;display:flex;flex-direction:column;justify-content:center;text-align:center;background:linear-gradient(45deg,rgba(220,38,127,0.8),rgba(255,0,0,0.6))}.title{font:700 72px/0.9 system-ui;text-transform:uppercase;text-shadow:3px 3px 6px rgba(0,0,0,0.8);margin-bottom:20px}.meta{font:600 32px system-ui;color:#eaeaea;margin-bottom:16px}.venue{font:500 28px system-ui;color:#fff;opacity:0.9}",
    "animation": {
      "intro": [{"target": ".title", "effect": "fadeInUp", "delay": 0}],
      "loop": []
    }
  }',
  true
);

-- Insert sample per-artist template
INSERT INTO tmpl_templates (name, kind, spec, published) VALUES (
  'Artist Spotlight',
  'perArtist',
  '{
    "$schema": "https://artbattle.app/template.v1.json",
    "name": "Artist Spotlight",
    "kind": "perArtist",
    "variants": [
      { "id": "square", "w": 1080, "h": 1080, "pixelRatio": 2 },
      { "id": "portrait", "w": 1080, "h": 1350, "pixelRatio": 2 }
    ],
    "assets": {
      "frame": "",
      "logo": "",
      "fonts": []
    },
    "layers": {
      "underlay": {
        "source": "artist.sample_asset_url",
        "fit": "cover",
        "mask": true
      },
      "textHtml": "<div class=\"t-wrap\"><div class=\"event-info\"><h2 class=\"event-title\">{event.title}</h2><p class=\"event-meta\">{event.city} • {event.date}</p></div><div class=\"artist-info\"><h1 class=\"artist-name\">{artist.display_name}</h1><p class=\"artist-label\">ARTIST</p></div></div>",
      "frame": "${assets.frame}",
      "logo": "${assets.logo}"
    },
    "css": ".t-wrap{position:absolute;inset:0;padding:40px;color:#fff;display:flex;flex-direction:column;justify-content:space-between}.event-info{text-align:center;background:rgba(0,0,0,0.7);padding:20px;border-radius:8px}.event-title{font:700 36px/1.1 system-ui;margin-bottom:8px;text-transform:uppercase}.event-meta{font:500 18px system-ui;color:#eaeaea}.artist-info{text-align:center;background:linear-gradient(135deg,rgba(220,38,127,0.9),rgba(255,0,0,0.8));padding:30px;border-radius:12px}.artist-name{font:700 64px/0.9 system-ui;text-transform:uppercase;text-shadow:2px 2px 4px rgba(0,0,0,0.5);margin-bottom:12px}.artist-label{font:600 24px system-ui;letter-spacing:3px;opacity:0.9}",
    "animation": {
      "intro": [{"target": ".artist-name", "effect": "fadeInUp", "delay": 0}],
      "loop": [{"target": ".underlay", "effect": "kenBurns", "scaleFrom": 1.05, "scaleTo": 1.12, "ms": 3200}]
    }
  }',
  true
);

-- Insert another event-wide template with different style
INSERT INTO tmpl_templates (name, kind, spec, published) VALUES (
  'Battle Night - Event Promo',
  'eventWide',
  '{
    "$schema": "https://artbattle.app/template.v1.json",
    "name": "Battle Night - Event Promo",
    "kind": "eventWide",
    "variants": [
      { "id": "square", "w": 1080, "h": 1080, "pixelRatio": 2 }
    ],
    "assets": {
      "frame": "",
      "logo": "",
      "fonts": []
    },
    "layers": {
      "underlay": {
        "source": "event.bgFallback",
        "fit": "cover",
        "mask": false
      },
      "textHtml": "<div class=\"t-wrap\"><div class=\"header\"><h1 class=\"title\">{event.title}</h1></div><div class=\"details\"><p class=\"date\">{event.date}</p><p class=\"location\">{event.city}</p><p class=\"venue\">{event.venue}</p></div><div class=\"cta\"><p class=\"action\">GET READY TO PAINT!</p></div></div>",
      "frame": "${assets.frame}",
      "logo": "${assets.logo}"
    },
    "css": ".t-wrap{position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,0.8),rgba(220,38,127,0.6));color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:50px;text-align:center}.header{border-bottom:4px solid #dc267f;padding-bottom:30px}.title{font:900 68px/0.8 system-ui;text-transform:uppercase;text-shadow:4px 4px 8px rgba(0,0,0,0.7)}.details{flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px}.date{font:700 42px system-ui;color:#ff6b9d}.location{font:600 38px system-ui}.venue{font:500 32px system-ui;color:#eaeaea}.cta{border-top:4px solid #dc267f;padding-top:30px}.action{font:800 36px system-ui;letter-spacing:2px;color:#ff6b9d}",
    "animation": {
      "intro": [],
      "loop": []
    }
  }',
  true
);