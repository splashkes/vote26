-- Fix the insert policies for votes and bids with correct column names

-- Votes: authenticated users can insert their own votes
CREATE POLICY "authenticated_insert_votes" ON public.votes
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        person_id IN (
            SELECT id FROM public.people 
            WHERE phone = auth.jwt()->>'phone' 
               OR phone_number = auth.jwt()->>'phone'
        )
    );

-- Bids: authenticated users can insert their own bids
CREATE POLICY "authenticated_insert_bids" ON public.bids
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        person_id IN (
            SELECT id FROM public.people 
            WHERE phone = auth.jwt()->>'phone' 
               OR phone_number = auth.jwt()->>'phone'
        )
    );