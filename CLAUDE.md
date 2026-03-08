## Supabase

- Supabase Migrations: `PGPASSWORD=$(cat ~/creds/supabase/db-password) psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/[MIGRATION_FILE].sql`
- Database Access: For console/direct access use db.xsqdkubgyqwpyvfltnrf.supabase.co:5432/postgres (password in ~/creds/supabase/db-password)
- Public URL: For public access use db.artb.art

## Application Overview

- This application is the front end for accessing a restful endpoint and supabase client application that provides users with the ability to access information about Art Battle live painting competition events; to vote and bid (auction) in those events.

## Project Naming

- Project is specifically called vote26 to distinguish it from previous Art Battle Vote app iterations

## Deployment

- Please use the deploy script to deploy ALWAYS
- **Main vote app**: /root/vote_app/vote26/art-battle-vote/deploy.sh (includes npm run build)
- **Admin app**: /root/vote_app/vote26/art-battle-admin/deploy.sh (builds and syncs to CDN)
- **Edge functions**: `supabase functions deploy <function-name>` from project root
- The main project supabase directory is /root/vote_app/vote26/supabase/ - do NOT download supabase functions or other data into anyplace but there.
- /root/vote_app/vote26/supabase-functions contains a backup copy of deployed functions
