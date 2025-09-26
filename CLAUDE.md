## Supabase

- Supabase Migrations - THE ONE LINE TO REMEMBER - bash PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres -f migrations/[MIGRATION_FILE].sql
- Database Access: For console/direct access use db.xsqdkubgyqwpyvfltnrf.supabase.co:5432/postgres
- Public URL: For public access use db.artb.art

## Application Overview

- This application is the front end for accessing a restful endpoint and supabase client application that provides users with the ability to access information about Art Battle live painting competition events; to vote and bid (auction) in those events.

## Project Naming

- Project is specifically called vote26 to distinguish it from previous Art Battle Vote app iterations

## Deployment

- Please use the deploy script to deploy ALWAYS
- To deploy and copy to CDN you must run: /root/vote_app/vote26/art-battle-vote/deploy.sh - and this has NPM run build built right in! No need to run separately
- you can look in /root/vote_app/vote26/supabase-functions which has a copy of the functions
- the main project supabase directory is /root/vote_app/vote26/supabase/ - do NOT download supabase functions or other data into anyplace but there.
- the main project supabase directory is /root/vote_app/vote26/supabase/ - do NOT download supabase functions or other data into anyplace but there.
- the main project supabase directory is /root/vote_app/vote26/supabase/ - do NOT download supabase functions or other data into anyplace but there.