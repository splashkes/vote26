-- Add RLS policies for authenticated users to read data

-- Events: authenticated users can read enabled events
CREATE POLICY "authenticated_read_events" ON public.events
    FOR SELECT 
    TO authenticated
    USING (enabled = true AND show_in_app = true);

-- Art: authenticated users can read all art
CREATE POLICY "authenticated_read_art" ON public.art
    FOR SELECT 
    TO authenticated
    USING (true);

-- Rounds: authenticated users can read all rounds
CREATE POLICY "authenticated_read_rounds" ON public.rounds
    FOR SELECT 
    TO authenticated
    USING (true);

-- Artist profiles: authenticated users can read all artist profiles
CREATE POLICY "authenticated_read_artist_profiles" ON public.artist_profiles
    FOR SELECT 
    TO authenticated
    USING (true);

-- People: authenticated users can read their own record
CREATE POLICY "authenticated_read_own_people" ON public.people
    FOR SELECT 
    TO authenticated
    USING (
        phone = auth.jwt()->>'phone' 
        OR phone_number = auth.jwt()->>'phone'
    );

-- Votes: authenticated users can read all votes
CREATE POLICY "authenticated_read_votes" ON public.votes
    FOR SELECT 
    TO authenticated
    USING (true);

-- Votes: authenticated users can insert their own votes
CREATE POLICY "authenticated_insert_votes" ON public.votes
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        voter_id IN (
            SELECT id FROM public.people 
            WHERE phone = auth.jwt()->>'phone' 
               OR phone_number = auth.jwt()->>'phone'
        )
    );

-- Bids: authenticated users can read all bids
CREATE POLICY "authenticated_read_bids" ON public.bids
    FOR SELECT 
    TO authenticated
    USING (true);

-- Bids: authenticated users can insert their own bids
CREATE POLICY "authenticated_insert_bids" ON public.bids
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        bidder_id IN (
            SELECT id FROM public.people 
            WHERE phone = auth.jwt()->>'phone' 
               OR phone_number = auth.jwt()->>'phone'
        )
    );

-- Art media: authenticated users can read all media
CREATE POLICY "authenticated_read_art_media" ON public.art_media
    FOR SELECT 
    TO authenticated
    USING (true);

-- Media files: authenticated users can read all media files
CREATE POLICY "authenticated_read_media_files" ON public.media_files
    FOR SELECT 
    TO authenticated
    USING (true);