-- Seed default competition specifics
-- Updated: 2025-10-21

-- Insert Open Materials Rules
INSERT INTO competition_specifics (name, content, visibility, version, created_at, updated_at)
VALUES (
  'Open Materials Rules',
  '# Art Battle Rules

**Art Battle Open Materials Rules
Updated June 2023**

1. Artists have 20 minutes to create their competition artwork (30 minutes in some championship rounds)
2. Artists must use the blank canvas provided at the competition as the surface for their artwork
3. The artwork must be placed on the easel as provided at the conclusion of the round
4. **Artists are encouraged to bring their own mediums and tools**. A limited set of acrylic paint is provided by local Art Battle producers. Artists are encouraged (but not required) to bring outside medium — Allowed mediums include: acrylic paint, ink, oil paint, charcoal, pen, pencil, watercolor, and more. ***Water based aerosol, airbrush, oils with solvent** are permitted only **at some venues, but restricted at others - audience safety and comfort is the main consideration in materials being allowed or not***
5. **The use of reference images are permitted**, but not required. Any reference images **must be printed** or prepared on paper
6. **Pre-made images (collage), including stencils, are not permitted**. Creation of stencils ''at the easel'' and during competition time is permitted
7. The local/global audience votes for the best artwork in each round, and the winner(s) advance to further rounds/events',
  'public',
  1,
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Insert Regular Season Event Timing
INSERT INTO competition_specifics (name, content, visibility, version, created_at, updated_at)
VALUES (
  'Regular Season Event Timing',
  '# Regular Season Event Format

**Round Structure**

- **All rounds**: 20 minutes per round
- **Number of artists**: Typically 12 artists
- **Format**: 3 preliminary rounds of 4 artists each
- **Advancement**: Top 2 from each preliminary round advance to the final
- **Canvas size**: 16" × 20" (standard)

**Schedule**

Artists should arrive 30 minutes before the event start time for setup and briefing.',
  'public',
  1,
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Insert Championship Finals Timing
INSERT INTO competition_specifics (name, content, visibility, version, created_at, updated_at)
VALUES (
  'Championship Finals Timing',
  '# Championship Event Format

**Round Structure**

- **Preliminary rounds**: 20 minutes per round
- **Final round**: 30 minutes
- **Number of artists**: Varies by championship level
- **Canvas size**: 16" × 20" (standard)

**Special Notes**

The extended final round allows for more detailed and complex artwork. Artists should plan their time management accordingly for the 30-minute finale.

**Schedule**

Championship events may have extended setup and briefing times. Please check your specific event details for arrival time.',
  'public',
  1,
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Insert Masters 2x45 Format
INSERT INTO competition_specifics (name, content, visibility, version, created_at, updated_at)
VALUES (
  'Masters 2×45 Format',
  '# Art Battle Masters Format

**Special Extended Format**

- **Number of artists**: 6 artists painting simultaneously
- **Duration**: 90 minutes total (2 × 45 minutes)
- **Intermission**: 15-minute break at the 45-minute mark
- **Canvas size**: 24" × 30" (larger format)

**Format Details**

This is a special extended format event featuring 6 accomplished artists creating larger works over an extended period. The intermission allows artists to step back, assess their work, and plan their completion strategy.

**What to Bring**

Due to the larger canvas and extended time:
- Bring sufficient materials for a 90-minute painting session
- Consider bringing additional water/paint medium
- Plan for material management during the intermission

**Voting**

Audience voting occurs after the full 90-minute session (after both 45-minute segments are complete).',
  'public',
  1,
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;
